import { config } from "dotenv";
config({ path: ".env.local" });

// Dynamic imports, not static ones: lib/db/client reads DATABASE_URL as soon
// as it loads, so it must not load until the dotenv config above has run.
async function seed() {
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("../lib/db/client");
  const { COLLECTIONS, CUSTOMERS, ORDERS, PAGES, PAYMENTS, PRODUCTS } =
    await import("../lib/db/data");
  const {
    cartLines,
    carts,
    collections,
    customers,
    orders,
    pages,
    payments,
    products,
  } = await import("../lib/db/schema");

  await migrate(db, { migrationsFolder: "./drizzle" });

  // Truncate rather than delete, so re-running the seed always starts from
  // the same fixed catalog, even after a manual edit to a seeded row.
  await db.execute(
    sql`truncate table ${cartLines}, ${carts}, ${payments}, ${orders}, ${customers}, ${products}, ${collections}, ${pages} restart identity cascade`,
  );

  await db.insert(products).values(PRODUCTS);
  await db.insert(collections).values(COLLECTIONS);
  await db.insert(customers).values(CUSTOMERS);
  await db.insert(orders).values(ORDERS);
  await db.insert(payments).values(PAYMENTS);
  // Every seeded page sets `seo`, even though the Page type leaves it
  // optional for pages the storefront might add without one.
  await db
    .insert(pages)
    .values(PAGES.map((page) => ({ ...page, seo: page.seo! })));

  console.log(
    `Seeded ${PRODUCTS.length} products, ${COLLECTIONS.length} collections, ` +
      `${CUSTOMERS.length} customers, ${ORDERS.length} orders, ` +
      `${PAYMENTS.length} payments, ${PAGES.length} pages.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
