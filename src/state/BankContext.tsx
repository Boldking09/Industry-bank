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
  createSeedState,
  type BankState,
  type Transaction,
} from "../data/seed";

const BANK_KEY = "ib.bank.v1";

export interface TransferInput {
  fromAccountId: string;
  recipient: string;
  amountCents: number;
  memo: string;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  confirmation?: string;
}

interface BankValue extends BankState {
  availableCents: number;
  transfer: (input: TransferInput) => TransferResult;
  resetDemo: () => void;
}

const BankContext = createContext<BankValue | null>(null);

function readState(): BankState {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (!raw) {
      return createSeedState();
    }
    const parsed = JSON.parse(raw) as Partial<BankState>;
    if (!Array.isArray(parsed?.accounts) || !Array.isArray(parsed?.transactions)) {
      return createSeedState();
    }
    return { accounts: parsed.accounts, transactions: parsed.transactions };
  } catch {
    return createSeedState();
  }
}

export function BankProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BankState>(readState);

  useEffect(() => {
    localStorage.setItem(BANK_KEY, JSON.stringify(state));
  }, [state]);

  const availableCents = useMemo(
    () =>
      state.accounts
        .filter((account) => account.kind !== "credit")
        .reduce((total, account) => total + account.balanceCents, 0),
    [state.accounts],
  );

  const transfer = useCallback(
    (input: TransferInput): TransferResult => {
      const account = state.accounts.find((item) => item.id === input.fromAccountId);
      if (!account) {
        return { ok: false, error: "Choose an account to transfer from." };
      }
      if (account.kind === "credit") {
        return {
          ok: false,
          error: "Transfers must come from a checking or savings account.",
        };
      }
      if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
        return { ok: false, error: "Enter an amount greater than $0.00." };
      }
      if (input.amountCents > account.balanceCents) {
        return {
          ok: false,
          error: "That amount is more than the available balance.",
        };
      }

      const confirmation = `IB${Math.floor(100_000 + Math.random() * 900_000)}`;
      const transaction: Transaction = {
        id: `txn-${Date.now()}`,
        accountId: account.id,
        merchant: input.recipient,
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

  const resetDemo = useCallback(() => {
    setState(createSeedState());
  }, []);

  const value = useMemo<BankValue>(
    () => ({
      accounts: state.accounts,
      transactions: state.transactions,
      availableCents,
      transfer,
      resetDemo,
    }),
    [state.accounts, state.transactions, availableCents, transfer, resetDemo],
  );

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
}

export function useBank(): BankValue {
  const context = useContext(BankContext);
  if (!context) {
    throw new Error("useBank must be used inside BankProvider");
  }
  return context;
}
