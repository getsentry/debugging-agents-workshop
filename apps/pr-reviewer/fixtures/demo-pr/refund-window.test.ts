import { describe, expect, it } from 'vitest';
import { canRefund } from './refund-window.ts';

const DAY_MS = 86_400_000;
const now = new Date('2026-10-01T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

describe('canRefund', () => {
  it('allows a refund on the day of delivery', () => {
    expect(canRefund(now, now)).toBe(true);
  });

  it('allows a refund one day after delivery', () => {
    expect(canRefund(daysAgo(1), now)).toBe(true);
  });

  it('allows a refund after 15 days', () => {
    expect(canRefund(daysAgo(15), now)).toBe(true);
  });

  it('allows a refund after 29 days', () => {
    expect(canRefund(daysAgo(29), now)).toBe(true);
  });

  it('allows a refund exactly 30 days after delivery', () => {
    expect(canRefund(daysAgo(30), now)).toBe(true);
  });

  it('refuses a refund one millisecond past 30 days', () => {
    expect(canRefund(new Date(daysAgo(30).getTime() - 1), now)).toBe(false);
  });

  it('refuses a refund after 31 days', () => {
    expect(canRefund(daysAgo(31), now)).toBe(false);
  });

  it('refuses a refund after a year', () => {
    expect(canRefund(daysAgo(365), now)).toBe(false);
  });

  it('allows a refund when delivery is dated in the future', () => {
    expect(canRefund(daysAgo(-2), now)).toBe(true);
  });

  it('defaults now to the current time', () => {
    expect(canRefund(new Date())).toBe(true);
  });
});
