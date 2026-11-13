export const SUPPORT_ADMIN_EMAIL = "admin@industrybank.test";

export const SUPPORT_CONNECT_NOTICE =
  "Connecting you to a live specialist. A member of our support team will join this conversation shortly.";

export type SupportSender = "user" | "ai" | "human";

export interface SupportMessageRow {
  id: string;
  user_id: string;
  sender: SupportSender;
  message: string;
  created_at: string;
}

export function isSupportAdmin(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === SUPPORT_ADMIN_EMAIL;
}

export function supportTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function supportWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return supportTime(value);
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
