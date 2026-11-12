export type AccountKind = "checking" | "savings" | "credit";

export const BANK_ROUTING_NUMBER = "021000021";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  mask: string;
  accountNumber: string;
  routingNumber: string;
  balanceCents: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  merchant: string;
  category: string;
  date: string;
  amountCents: number;
}

export interface BankState {
  accounts: Account[];
  transactions: Transaction[];
}

export interface TrendPoint {
  label: string;
  amountCents: number;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

export function createSeedState(): BankState {
  return {
    accounts: [
      {
        id: "acct-checking",
        name: "Everyday Checking",
        kind: "checking",
        mask: "4821",
        accountNumber: "1000004821",
        routingNumber: BANK_ROUTING_NUMBER,
        balanceCents: 90_000_000,
      },
      {
        id: "acct-savings",
        name: "High-Yield Savings",
        kind: "savings",
        mask: "9930",
        accountNumber: "1000009930",
        routingNumber: BANK_ROUTING_NUMBER,
        balanceCents: 10_056_500,
      },
      {
        id: "acct-credit",
        name: "Industry Credit Card",
        kind: "credit",
        mask: "2214",
        accountNumber: "1000002214",
        routingNumber: BANK_ROUTING_NUMBER,
        balanceCents: -128_432,
      },
    ],
    transactions: [
      {
        id: "txn-payroll",
        accountId: "acct-checking",
        merchant: "Northwind Studio Payroll",
        category: "Income",
        date: daysAgo(2),
        amountCents: 342_000,
      },
      {
        id: "txn-coffee",
        accountId: "acct-checking",
        merchant: "Blue Bottle Coffee",
        category: "Food & drink",
        date: daysAgo(1),
        amountCents: -675,
      },
      {
        id: "txn-groceries",
        accountId: "acct-checking",
        merchant: "Whole Foods Market",
        category: "Groceries",
        date: daysAgo(3),
        amountCents: -12_844,
      },
      {
        id: "txn-transit",
        accountId: "acct-checking",
        merchant: "City Transit",
        category: "Transport",
        date: daysAgo(4),
        amountCents: -290,
      },
      {
        id: "txn-rent",
        accountId: "acct-checking",
        merchant: "Maple Court Apartments",
        category: "Housing",
        date: daysAgo(6),
        amountCents: -215_000,
      },
      {
        id: "txn-netflix",
        accountId: "acct-credit",
        merchant: "Netflix",
        category: "Subscriptions",
        date: daysAgo(7),
        amountCents: -2_299,
      },
      {
        id: "txn-savings",
        accountId: "acct-savings",
        merchant: "Automatic Savings Transfer",
        category: "Transfer",
        date: daysAgo(9),
        amountCents: 50_000,
      },
      {
        id: "txn-interest",
        accountId: "acct-savings",
        merchant: "Interest Payment",
        category: "Income",
        date: daysAgo(11),
        amountCents: 4_112,
      },
    ],
  };
}

export function getSpendingTrend(): TrendPoint[] {
  const values = [182_000, 214_500, 196_000, 238_000, 205_000, 167_500];
  return values.map((amountCents, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (values.length - 1 - index));
    return {
      label: date.toLocaleDateString("en-US", { month: "short" }),
      amountCents,
    };
  });
}
