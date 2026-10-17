export function nextOrderId(last: string): string {
  const next = parseInt(last, 10) + 1;
  return String(next).padStart(last.length, "0");
}
