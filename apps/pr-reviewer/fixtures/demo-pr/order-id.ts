export function nextOrderId(last: string): string {
  if (!/^\d+$/.test(last)) {
    throw new RangeError(`Order id is not numeric: ${last}`);
  }
  return String(Number(last) + 1);
}
