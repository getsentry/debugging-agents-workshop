import { applyDiscount } from './discount.ts';
import { shippingCost } from './shipping.ts';

export function cartTotal(items: { price: number; qty: number }[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].qty < 0) {
      throw new RangeError(`Negative quantity for item ${i}`);
    }
    total += items[i].price * items[i].qty;
  }
  return total;
}

export type Cart = {
  items: { price: number; qty: number }[];
  weightKg: number;
  express?: boolean;
  taxRate: number;
  discount?: { code: string; percent: number };
};

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function checkoutTotal(cart: Cart): number {
  const subtotal = cartTotal(cart.items);
  const shipping = shippingCost(cart.weightKg, cart.express);
  const freeShipping = subtotal >= 100;
  const shippingCharge = freeShipping ? 0 : shipping;
  const taxable = subtotal + shippingCharge;
  const tax = roundCents(taxable * cart.taxRate);
  let total = taxable + tax;
  if (cart.discount) {
    total = applyDiscount(total, cart.discount.percent);
  }
  return roundCents(total);
}
