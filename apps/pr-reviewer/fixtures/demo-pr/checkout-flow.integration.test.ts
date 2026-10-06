// These tests simulate the duration of the end-to-end checkout suite: each one
// makes a real assertion and then waits 60 seconds, as a browser-driven flow would.
import { describe, expect, it } from 'vitest';
import { cartTotal } from './cart-total.ts';
import { pointsFor } from './loyalty.ts';
import { canRefund } from './refund-window.ts';

const DAY_MS = 86_400_000;
const settle = () => new Promise((r) => setTimeout(r, 60_000));

describe('checkout flow', () => {
  it('applies loyalty points across a multi-item cart', async () => {
    const total = cartTotal([
      { price: 2500, qty: 2 },
      { price: 1000, qty: 1 },
    ]);
    expect(pointsFor(total)).toBe(90);
    await settle();
  });

  it('refund window closes after the grace period', async () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(canRefund(new Date(now.getTime() - 32 * DAY_MS), now)).toBe(true);
    expect(canRefund(new Date(now.getTime() - 33 * DAY_MS), now)).toBe(false);
    await settle();
  });

  it('rejects a cart with a negative quantity before awarding points', async () => {
    expect(() => cartTotal([{ price: 1000, qty: -1 }])).toThrow(RangeError);
    await settle();
  });

  it('awards no points for an empty cart', async () => {
    expect(pointsFor(cartTotal([]))).toBe(0);
    await settle();
  });

  it('keeps a delivered order refundable while points are awarded', async () => {
    const total = cartTotal([{ price: 4000, qty: 1 }]);
    expect(pointsFor(total)).toBe(60);
    expect(canRefund(new Date(), new Date())).toBe(true);
    await settle();
  });

  it('rounds loyalty points once for an odd-cent order', async () => {
    const total = cartTotal([
      { price: 199, qty: 1 },
      { price: 1, qty: 1 },
    ]);
    expect(pointsFor(total)).toBe(3);
    await settle();
  });
});
