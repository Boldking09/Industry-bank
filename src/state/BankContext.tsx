import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BANK_ROUTING_NUMBER,
  createSeedState,
  type Account,
  type AccountKind,
  type BankState,
  type Transaction,
} from "../data/seed";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const BANK_KEY = "ib.bank.v1";

export interface TransferInput {
  fromAccountId: string;
  recipient: string;
  recipientAccountNumber: string;
  amountCents: number;
  memo: string;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  reason?: "external-account";
  confirmation?: string;
}

function isExternalAccountError(message: string): boolean {
  return /no industry bank account matches|no account (?:matches|found)|account number (?:was )?not found|recipient account (?:was )?not found/i.test(
    message,
  );
}

interface BankValue extends BankState {
  availableCents: number;
  loading: boolean;
  transfer: (input: TransferInput) => Promise<TransferResult>;
  resetAccounts: () => Promise<void>;
}

const BankContext = createContext<BankValue | null>(null);

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function computeAvailable(accounts: Account[]): number {
  return accounts
    .filter((account) => account.kind !== "credit")
    .reduce((total, account) => total + account.balanceCents, 0);
}

function validateTransfer(accounts: Account[], input: TransferInput): string | null {
  const account = accounts.find((item) => item.id === input.fromAccountId);
  if (!account) {
    return "Choose an account to transfer from.";
  }
  if (account.kind === "credit") {
    return "Transfers must come from a checking or savings account.";
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return "Enter an amount greater than $0.00.";
  }
  if (input.amountCents > account.balanceCents) {
    return "That amount is more than the available balance.";
  }
  const accountNumber = input.recipientAccountNumber.replace(/\D/g, "");
  if (!accountNumber) {
    return "Enter the recipient's account number.";
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    return "Enter a valid 10-digit account number.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Supabase-backed provider (used when VITE_SUPABASE_* is configured)         */
/* -------------------------------------------------------------------------- */

interface AccountRow {
  id: string;
  kind: AccountKind;
  name: string;
  mask: string;
  account_number: string;
  routing_number: string;
  balance_cents: number;
}

interface TransactionRow {
  id: string;
  account_id: string;
  merchant: string;
  category: string;
  amount_cents: number;
  created_at: string;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mask: row.mask,
    accountNumber: row.account_number,
    routingNumber: row.routing_number,
    balanceCents: Number(row.balance_cents),
  };
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    merchant: row.merchant,
    category: row.category,
    date: row.created_at,
    amountCents: Number(row.amount_cents),
  };
}

function SupabaseBankProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.id ?? null;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const client = supabase;
    if (!client || !userId) {
      setAccounts([]);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [accountResult, transactionResult] = await Promise.all([
      client
        .from("accounts")
        .select("id, kind, name, mask, account_number, routing_number, balance_cents")
        .order("kind", { ascending: true }),
      client
        .from("transactions")
        .select("id, account_id, merchant, category, amount_cents, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (accountResult.error || transactionResult.error) {
      setLoading(false);
      return;
    }

    setAccounts((accountResult.data as AccountRow[] | null)?.map(mapAccount) ?? []);
    setTransactions(
      (transactionResult.data as TransactionRow[] | null)?.map(mapTransaction) ?? [],
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) {
      return;
    }

    const channel = client
      .channel(`bank:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [userId, refresh]);

  const transfer = useCallback(
    async (input: TransferInput): Promise<TransferResult> => {
      const client = supabase;
      if (!client) {
        return { ok: false, error: "Supabase is not configured." };
      }

      const validationError = validateTransfer(accounts, input);
      if (validationError) {
        return { ok: false, error: validationError };
      }

      const { data, error } = await client.rpc("transfer_funds", {
        p_from_account_id: input.fromAccountId,
        p_recipient_account_number: input.recipientAccountNumber.replace(/\D/g, ""),
        p_amount_cents: input.amountCents,
        p_memo: input.memo.trim() || null,
      });

      if (error) {
        if (isExternalAccountError(error.message)) {
          return { ok: false, reason: "external-account", error: error.message };
        }
        return { ok: false, error: error.message };
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | { confirmation_code: string; new_balance_cents: number }
        | undefined;

      if (row && row.new_balance_cents != null) {
        setAccounts((previous) =>
          previous.map((account) =>
            account.id === input.fromAccountId
              ? { ...account, balanceCents: Number(row.new_balance_cents) }
              : account,
          ),
        );
      }

      void refresh();

      return {
        ok: true,
        confirmation: row?.confirmation_code ?? `IB${Date.now().toString().slice(-6)}`,
      };
    },
    [accounts, refresh],
  );

  const resetAccounts = useCallback(async () => {
    const client = supabase;
    if (client) {
      await client.rpc("reset_my_accounts");
    }
    await refresh();
  }, [refresh]);

  const availableCents = useMemo(() => computeAvailable(accounts), [accounts]);

  const value = useMemo<BankValue>(
    () => ({
      accounts,
      transactions,
      availableCents,
      loading,
      transfer,
      resetAccounts,
    }),
    [accounts, transactions, availableCents, loading, transfer, resetAccounts],
  );

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Local provider (fallback when Supabase is not configured)                  */
/* -------------------------------------------------------------------------- */

function readLocalState(): BankState {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (!raw) {
      return createSeedState();
    }
    const parsed = JSON.parse(raw) as Partial<BankState>;
    if (!Array.isArray(parsed?.accounts) || !Array.isArray(parsed?.transactions)) {
      return createSeedState();
    }
    const seeded = createSeedState();
    return {
      accounts: parsed.accounts.map((account) => {
        const fallback = seeded.accounts.find((item) => item.id === account.id);
        return {
          ...account,
          accountNumber: account.accountNumber || fallback?.accountNumber || "",
          routingNumber:
            account.routingNumber || fallback?.routingNumber || BANK_ROUTING_NUMBER,
        };
      }),
      transactions: parsed.transactions,
    };
  } catch {
    return createSeedState();
  }
}

function LocalBankProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BankState>(readLocalState);

  useEffect(() => {
    localStorage.setItem(BANK_KEY, JSON.stringify(state));
  }, [state]);

  const availableCents = useMemo(() => computeAvailable(state.accounts), [state.accounts]);

  const transfer = useCallback(
    async (input: TransferInput): Promise<TransferResult> => {
      const validationError = validateTransfer(state.accounts, input);
      if (validationError) {
        return { ok: false, error: validationError };
      }

      const account = state.accounts.find((item) => item.id === input.fromAccountId);
      if (!account) {
        return { ok: false, error: "Choose an account to transfer from." };
      }

      const confirmation = `IB${Math.floor(100_000 + Math.random() * 900_000)}`;
      const transaction: Transaction = {
        id: `txn-${Date.now()}`,
        accountId: account.id,
        merchant:
          input.recipient || input.recipientAccountNumber.replace(/\D/g, ""),
        category: input.memo || "Transfer",
        date: new Date().toISOString(),
        amountCents: -input.amountCents,
      };

      setState((previous) => ({
        accounts: previous.accounts.map((item) =>
          item.id === account.id
            ? { ...item, balanceCents: item.balanceCents - input.amountCents }
            : item,
        ),
        transactions: [transaction, ...previous.transactions],
      }));

      return { ok: true, confirmation };
    },
    [state.accounts],
  );

  const resetAccounts = useCallback(async () => {
    setState(createSeedState());
  }, []);

  const value = useMemo<BankValue>(
    () => ({
      accounts: state.accounts,
      transactions: state.transactions,
      availableCents,
      loading: false,
      transfer,
      resetAccounts,
    }),
    [state.accounts, state.transactions, availableCents, transfer, resetAccounts],
  );

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
}

/* -------------------------------------------------------------------------- */

export function BankProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseBankProvider>{children}</SupabaseBankProvider>
  ) : (
    <LocalBankProvider>{children}</LocalBankProvider>
  );
}

export function useBank(): BankValue {
  const context = useContext(BankContext);
  if (!context) {
    throw new Error("useBank must be used inside BankProvider");
  }
  return context;
}
