export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return sign + "$" + Math.abs(cents) / 100;
}
