const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(cents: number): string {
  return usd.format(cents / 100);
}

export function formatSignedCurrency(cents: number): string {
  const absolute = usd.format(Math.abs(cents) / 100);
  return `${cents >= 0 ? "+" : "-"}${absolute}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

export function formatRoutingNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/(.{3})(?=.)/g, "$1 ");
}

export function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `•••• •••• ${digits.slice(-4)}`;
}

export function parseAmountToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    return null;
  }
  const [dollars, cents = ""] = cleaned.split(".");
  const total = Number(dollars) * 100 + Number(`${cents}00`.slice(0, 2));
  return Number.isFinite(total) ? total : null;
}
