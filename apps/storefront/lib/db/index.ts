import { and, arrayContains, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type {
  Cart,
  CartItem,
  Collection,
  Customer,
  Menu,
  Order,
  Page,
  Product,
  StoredCart,
} from "lib/commerce/types";
import { db } from "./client";
import { MENUS, type MenuHandle } from "./menus";
import {
  cartLines,
  carts,
  collections,
  customers,
  orders,
  pages,
  payments,
  products,
} from "./schema";

export type Payment = {
  orderId: string;
  chargeId: string;
  brand: string;
  last4: string;
};

type ProductRow = typeof products.$inferSelect;

// Drops the columns a row carries only so queries can filter and sort; they
// are not part of the product the storefront renders.
const toProduct = ({
  collections: _collections,
  bestSellingRank: _bestSellingRank,
  createdAt: _createdAt,
  ...product
}: ProductRow): Product => product;

function sortProducts(
  rows: ProductRow[],
  sortKey?: string,
  reverse?: boolean,
): ProductRow[] {
  const sorted = [...rows];

  switch (sortKey) {
    case "PRICE":
      sorted.sort(
        (a, b) =>
          parseFloat(a.priceRange.minVariantPrice.amount) -
          parseFloat(b.priceRange.minVariantPrice.amount),
      );
      break;
    case "CREATED_AT":
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "BEST_SELLING":
      sorted.sort((a, b) => a.bestSellingRank - b.bestSellingRank);
      break;
    // RELEVANCE (the default) keeps catalog order.
  }

  if (reverse) sorted.reverse();
  return sorted;
}

// Case-insensitive over title, description, and tags — `tags` is a Postgres
// array, so it needs its own unnest rather than a plain ilike.
function matchesSearchTerm(term: string) {
  const pattern = `%${term}%`;
  return or(
    ilike(products.title, pattern),
    ilike(products.description, pattern),
    sql`exists (select 1 from unnest(${products.tags}) tag where tag ilike ${pattern})`,
  );
}

export async function selectProducts(
  options: { search?: string; sortKey?: string; reverse?: boolean } = {},
): Promise<Product[]> {
  const { search, sortKey, reverse } = options;
  const term = search?.toLowerCase().trim();

  const rows = await db
    .select()
    .from(products)
    .where(term ? matchesSearchTerm(term) : undefined);

  return sortProducts(rows, sortKey, reverse).map(toProduct);
}

export async function selectProductsByCollection(
  collectionHandle: string,
  options: { sortKey?: string; reverse?: boolean } = {},
): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(arrayContains(products.collections, [collectionHandle]));

  return sortProducts(rows, options.sortKey, options.reverse).map(toProduct);
}

export async function selectProduct(
  handle: string,
): Promise<Product | undefined> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.handle, handle))
    .limit(1);

  return row ? toProduct(row) : undefined;
}

export async function selectRecommendations(
  productId: string,
): Promise<Product[]> {
  const rows = await db.select().from(products);
  const current = rows.find((p) => p.id === productId);
  const related = rows.filter(
    (p) =>
      p.id !== productId &&
      p.collections.some(
        (c) => !c.startsWith("hidden") && current?.collections.includes(c),
      ),
  );
  const fallback = rows.filter(
    (p) => p.id !== productId && !related.includes(p),
  );
  return [...related, ...fallback].slice(0, 4).map(toProduct);
}

export async function selectCollections(): Promise<Collection[]> {
  return db.select().from(collections);
}

export async function selectCollection(
  handle: string,
): Promise<Collection | undefined> {
  const [row] = await db
    .select()
    .from(collections)
    .where(eq(collections.handle, handle))
    .limit(1);

  return row;
}

export async function selectMenu(handle: MenuHandle): Promise<Menu[]> {
  return MENUS[handle];
}

export async function selectPage(handle: string): Promise<Page | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(eq(pages.handle, handle))
    .limit(1);

  return row;
}

export async function selectPages(): Promise<Page[]> {
  return db.select().from(pages);
}

export async function selectCustomer(
  id: string,
): Promise<Customer | undefined> {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  return row;
}

export async function selectOrder(
  customerId: string,
  orderId: string,
): Promise<Order | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.id, orderId)))
    .limit(1);

  return row;
}

// The demo's planted bug: orders that predate the payments launch (see
// PAYMENTS in data.ts) have no row here, so a refund of a legacy order fails.
export async function selectPayment(orderId: string): Promise<Payment> {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .limit(1);

  if (!row) {
    throw new Error(
      `Order ${orderId} predates the payments launch and has no charge to refund`,
    );
  }

  return row;
}

export async function selectOrders(
  customerId: string,
  limit: number = 10,
): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

function findVariant(rows: ProductRow[], merchandiseId: string) {
  for (const product of rows) {
    const variant = product.variants.find((v) => v.id === merchandiseId);
    if (variant) return { product, variant };
  }
  return undefined;
}

function buildCartItem(
  rows: ProductRow[],
  id: string,
  merchandiseId: string,
  quantity: number,
): CartItem | undefined {
  const match = findVariant(rows, merchandiseId);
  if (!match) return undefined;
  const { product, variant } = match;

  return {
    id,
    quantity,
    cost: {
      totalAmount: {
        amount: (parseFloat(variant.price.amount) * quantity).toFixed(2),
        currencyCode: variant.price.currencyCode,
      },
    },
    merchandise: {
      id: variant.id,
      title: variant.title,
      selectedOptions: variant.selectedOptions,
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        featuredImage: product.featuredImage,
      },
    },
  };
}

function computeCart(id: string, lines: CartItem[]): StoredCart {
  const subtotal = lines.reduce(
    (sum, line) => sum + parseFloat(line.cost.totalAmount.amount),
    0,
  );
  const money = (amount: number) => ({
    amount: amount.toFixed(2),
    currencyCode: "USD",
  });

  return {
    id,
    checkoutUrl: "/checkout",
    cost: {
      subtotalAmount: money(subtotal),
      totalAmount: money(subtotal),
      totalTaxAmount: money(0),
    },
    lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

async function loadCartItems(cartId: string): Promise<CartItem[]> {
  const [lineRows, productRows] = await Promise.all([
    db.select().from(cartLines).where(eq(cartLines.cartId, cartId)),
    db.select().from(products),
  ]);

  return lineRows
    .map((line) =>
      buildCartItem(productRows, line.id, line.merchandiseId, line.quantity),
    )
    .filter((line): line is CartItem => line !== undefined);
}

// The cookie may reference a cart from a previous server process; recreate
// the row instead of failing so a stale cookie doesn't break the cart UI.
async function ensureCart(cartId: string): Promise<void> {
  await db.insert(carts).values({ id: cartId }).onConflictDoNothing();
}

export async function insertCart(): Promise<StoredCart> {
  const id = crypto.randomUUID();
  await db.insert(carts).values({ id });
  return computeCart(id, []);
}

export async function selectCart(id: string): Promise<Cart | undefined> {
  const [row] = await db.select().from(carts).where(eq(carts.id, id)).limit(1);
  if (!row) return undefined;

  return computeCart(id, await loadCartItems(id));
}

export async function insertCartLines(
  cartId: string,
  newLines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  await ensureCart(cartId);

  const [existingLines, productRows] = await Promise.all([
    db.select().from(cartLines).where(eq(cartLines.cartId, cartId)),
    db.select().from(products),
  ]);

  for (const { merchandiseId, quantity } of newLines) {
    if (!findVariant(productRows, merchandiseId)) continue;

    const existing = existingLines.find(
      (line) => line.merchandiseId === merchandiseId,
    );

    if (existing) {
      await db
        .update(cartLines)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(cartLines.id, existing.id));
    } else {
      await db.insert(cartLines).values({
        id: `line_${crypto.randomUUID()}`,
        cartId,
        merchandiseId,
        quantity,
      });
    }
  }

  return computeCart(cartId, await loadCartItems(cartId));
}

export async function updateCartLines(
  cartId: string,
  updates: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  await ensureCart(cartId);

  const productRows = await db.select().from(products);

  for (const { id, merchandiseId, quantity } of updates) {
    if (!findVariant(productRows, merchandiseId)) continue;

    await db
      .update(cartLines)
      .set({ merchandiseId, quantity })
      .where(and(eq(cartLines.cartId, cartId), eq(cartLines.id, id)));
  }

  return computeCart(cartId, await loadCartItems(cartId));
}

export async function deleteCartLines(
  cartId: string,
  lineIds: string[],
): Promise<Cart> {
  await ensureCart(cartId);

  if (lineIds.length > 0) {
    await db
      .delete(cartLines)
      .where(and(eq(cartLines.cartId, cartId), inArray(cartLines.id, lineIds)));
  }

  return computeCart(cartId, await loadCartItems(cartId));
}
