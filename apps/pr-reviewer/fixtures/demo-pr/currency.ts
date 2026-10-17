export function formatUsd(cents: number): string {
  return "$" + cents / 100;
}

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND"]);

export function formatAmount(minorUnits: number, currency: string): string {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
    return `${minorUnits} ${currency}`;
  }
  return `${(minorUnits / 100).toFixed(2)} ${currency}`;
}
