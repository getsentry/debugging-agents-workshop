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
