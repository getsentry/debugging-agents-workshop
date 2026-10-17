export function applyDiscount(total: number, percent: number): number {
  const rate = Math.min(Math.max(percent, 0), 1);
  return total - total * rate;
}
