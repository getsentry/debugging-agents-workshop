import { describe, expect, it } from 'vitest';
import { cartTotal } from './cart-total.ts';

describe('cartTotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(cartTotal([])).toBe(0);
  });

  it('returns the price of a single item with quantity 1', () => {
    expect(cartTotal([{ price: 500, qty: 1 }])).toBe(500);
  });

  it('multiplies price by quantity', () => {
    expect(cartTotal([{ price: 250, qty: 4 }])).toBe(1000);
  });

  it('sums several items', () => {
    expect(
      cartTotal([
        { price: 100, qty: 2 },
        { price: 300, qty: 1 },
        { price: 50, qty: 3 },
      ]),
    ).toBe(650);
  });

  it('counts the last item in the cart', () => {
    expect(
      cartTotal([
        { price: 1, qty: 1 },
        { price: 2, qty: 1 },
        { price: 4, qty: 1 },
      ]),
    ).toBe(7);
  });

  it('ignores items with quantity 0', () => {
    expect(
      cartTotal([
        { price: 999, qty: 0 },
        { price: 10, qty: 1 },
      ]),
    ).toBe(10);
  });

  it('rejects a negative quantity', () => {
    expect(() => cartTotal([{ price: 100, qty: -1 }])).toThrow(RangeError);
  });

  it('names the offending item in the negative quantity error', () => {
    expect(() =>
      cartTotal([
        { price: 100, qty: 1 },
        { price: 100, qty: -2 },
      ]),
    ).toThrow('Negative quantity for item 1');
  });

  it('handles zero-priced items', () => {
    expect(cartTotal([{ price: 0, qty: 5 }])).toBe(0);
  });

  it('handles large quantities', () => {
    expect(cartTotal([{ price: 3, qty: 1_000_000 }])).toBe(3_000_000);
  });

  it('rounds each line to whole cents', () => {
    expect(
      cartTotal([
        { price: 33.3, qty: 3 },
        { price: 10.4, qty: 1 },
      ]),
    ).toBe(110);
  });
});
