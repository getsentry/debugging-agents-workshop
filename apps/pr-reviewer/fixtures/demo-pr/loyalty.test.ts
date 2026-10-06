import { describe, expect, it } from 'vitest';
import { pointsFor } from './loyalty.ts';

describe('pointsFor', () => {
  it('awards nothing for a zero total', () => {
    expect(pointsFor(0)).toBe(0);
  });

  it('awards 1.5 points per whole dollar', () => {
    expect(pointsFor(10_000)).toBe(150);
  });

  it('scales linearly for large totals', () => {
    expect(pointsFor(20_000)).toBe(300);
  });

  it('rounds half a point up', () => {
    expect(pointsFor(100)).toBe(2);
  });

  it('rounds once, after the multiplier', () => {
    expect(pointsFor(199)).toBe(3);
  });

  it('awards nothing below a third of a dollar', () => {
    expect(pointsFor(33)).toBe(0);
  });

  it('rounds 0.75 points up to 1', () => {
    expect(pointsFor(50)).toBe(1);
  });

  it('awards nothing for a single cent', () => {
    expect(pointsFor(1)).toBe(0);
  });

  it('handles odd cent totals', () => {
    expect(pointsFor(12_345)).toBe(185);
  });

  it('returns a whole number', () => {
    expect(Number.isInteger(pointsFor(777))).toBe(true);
  });
});
