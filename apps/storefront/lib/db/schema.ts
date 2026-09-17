import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";
import type {
  Image,
  Money,
  OrderLine,
  OrderStatus,
  ProductOption,
  ProductVariant,
  SEO,
} from "lib/commerce/types";

// Nested product fields (options, variants, images, priceRange, seo) keep the
// exact shape lib/commerce/types already defines, stored as jsonb instead of
// their own tables — the storefront never queries into them.
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  availableForSale: boolean("available_for_sale").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  descriptionHtml: text("description_html").notNull(),
  options: jsonb("options").$type<ProductOption[]>().notNull(),
  priceRange: jsonb("price_range")
    .$type<{ maxVariantPrice: Money; minVariantPrice: Money }>()
    .notNull(),
  variants: jsonb("variants").$type<ProductVariant[]>().notNull(),
  featuredImage: jsonb("featured_image").$type<Image>().notNull(),
  images: jsonb("images").$type<Image[]>().notNull(),
  seo: jsonb("seo").$type<SEO>().notNull(),
  tags: text("tags").array().notNull(),
  updatedAt: text("updated_at").notNull(),
  // Which collections a product belongs to; queried with array-contains
  // rather than a join table, since a product's collection set never grows
  // past a handful of entries.
  collections: text("collections").array().notNull(),
  bestSellingRank: integer("best_selling_rank").notNull(),
  createdAt: text("created_at").notNull(),
});

export const collections = pgTable("collections", {
  handle: text("handle").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  seo: jsonb("seo").$type<SEO>().notNull(),
  updatedAt: text("updated_at").notNull(),
  path: text("path").notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  memberSince: text("member_since").notNull(),
  loyalty: jsonb("loyalty")
    .$type<{ tier: string; points: number }>()
    .notNull(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  createdAt: text("created_at").notNull(),
  status: text("status").$type<OrderStatus>().notNull(),
  lines: jsonb("lines").$type<OrderLine[]>().notNull(),
  total: jsonb("total").$type<Money>().notNull(),
});

// One payment per order, and only for orders placed after the payments
// system launched in June 2026 — see lib/db/data.ts. A missing row here is
// the demo's planted bug, not a schema gap.
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  chargeId: text("charge_id").notNull(),
  brand: text("brand").notNull(),
  last4: text("last4").notNull(),
});

export const pages = pgTable("pages", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  handle: text("handle").notNull().unique(),
  body: text("body").notNull(),
  bodySummary: text("body_summary").notNull(),
  seo: jsonb("seo").$type<SEO>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Carts are the only mutable tables. `carts` just anchors the id the
// visitor's `cartId` cookie carries; lines live in `cart_lines` so quantity
// updates touch one row instead of rewriting a jsonb blob.
export const carts = pgTable("carts", {
  id: text("id").primaryKey(),
});

export const cartLines = pgTable("cart_lines", {
  id: text("id").primaryKey(),
  cartId: text("cart_id")
    .notNull()
    .references(() => carts.id),
  merchandiseId: text("merchandise_id").notNull(),
  quantity: integer("quantity").notNull(),
});
