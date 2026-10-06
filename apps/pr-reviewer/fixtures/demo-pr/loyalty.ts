export type LoyaltyTier = 'standard' | 'gold';

const TIER_MULTIPLIER: Record<LoyaltyTier, number> = { standard: 1.5, gold: 2 };

/** Points per whole dollar spent depend on the tier, rounded once after the multiplier. */
export function pointsFor(totalCents: number, tier: LoyaltyTier = 'standard'): number {
  return Math.round((totalCents / 100) * TIER_MULTIPLIER[tier]);
}
