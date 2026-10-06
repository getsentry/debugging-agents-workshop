/** One and a half points per whole dollar spent, rounded once after the multiplier. */
export function pointsFor(totalCents: number): number {
  return Math.round((totalCents / 100) * 1.5);
}
