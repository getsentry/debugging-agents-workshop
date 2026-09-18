export function pointsFor(totalCents: number): number {
  return Math.round(totalCents / 100) * 1.5;
}
