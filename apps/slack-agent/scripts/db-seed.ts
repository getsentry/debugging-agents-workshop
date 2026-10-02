import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "pg";
import { generateWarehouse } from "../src/analytics/generate.ts";
import { strictSslMode } from "../src/analytics/store.ts";

const BATCH_SIZE = 500;

function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy the storefront's Neon URL into apps/slack-agent/.env.local and run npm run db:seed.",
    );
  }
  const pool = new Pool({ connectionString: strictSslMode(connectionString) });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      metric text NOT NULL, date date NOT NULL, dimension text, dimension_value text, value double precision NOT NULL
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS analytics_daily_metric_date ON analytics_daily (metric, date);`,
  );
  await pool.query(`TRUNCATE analytics_daily;`);

  const endDate = todayIso();
  const rows = generateWarehouse(endDate);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((row, j) => {
      const base = j * 5;
      values.push(row.metric, row.date, row.dimension, row.dimensionValue, row.value);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    await pool.query(
      `INSERT INTO analytics_daily (metric, date, dimension, dimension_value, value) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  const dates = rows.map((row) => row.date).sort();
  console.log(`Seeded ${rows.length} rows, ${dates[0]} to ${dates[dates.length - 1]}.`);

  await pool.end();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
