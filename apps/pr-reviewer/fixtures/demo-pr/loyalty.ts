/** One and a half points per whole dollar spent, rounded once after the multiplier. Refunds earn nothing. */
export function pointsFor(totalCents: number): number {
  if (totalCents < 0) {
    return 0;
  }
  return Math.round((totalCents / 100) * 1.5);
}
