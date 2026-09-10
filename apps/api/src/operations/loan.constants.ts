export const LOAN_OUT_CONDITIONS = [
  "GOOD",
  "NORMAL",
  "SCRATCHED",
  "MINOR_FAULT",
  "OTHER",
] as const;
export const LOAN_IN_CONDITIONS = [
  "GOOD",
  "NORMAL",
  "SCRATCHED",
  "BROKEN",
  "MISSING_ACCESSORIES",
  "LOST",
  "OTHER",
] as const;
export const LOAN_OPEN_STATUSES = [
  "ACTIVE",
  "PARTIALLY_RETURNED",
  "COMPLETED",
  "PARTIAL",
];
export const loanDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const loanOverdueDays = (dueDate?: Date, now = new Date()) =>
  dueDate
    ? Math.max(
        0,
        Math.round(
          (Date.parse(loanDay(now)) - Date.parse(loanDay(dueDate))) / 86400000,
        ),
      )
    : 0;
