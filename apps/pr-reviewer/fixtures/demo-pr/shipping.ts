export function shippingCost(weightKg: number, express = false): number {
  const base = weightKg > 5 ? 12 : 6;
  return express ? base * 2 : base;
}
