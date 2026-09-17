import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add a " +
      "Neon connection string, or run scripts/setup.sh.",
  );
}

// Plain node-postgres driver, not @neondatabase/serverless: a later lab adds
// database instrumentation that only supports `pg`.
const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
