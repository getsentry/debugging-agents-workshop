export type CartItem = { price: number; qty: number; discountCents?: number };

export function cartTotal(items: CartItem[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].qty < 0) {
      throw new RangeError(`Negative quantity for item ${i}`);
    }
    const line = items[i].price * items[i].qty;
    total += line - (items[i].discountCents ?? 0);
  }
  return total;
}
