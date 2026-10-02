export function nextOrderId(last: string): string {
  return String(parseInt(last) + 1);
}
