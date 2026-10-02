// The Lighthouse analytics warehouse, now a real Postgres table on Neon:
// scan() runs one SQL query through the `pg` driver, which @sentry/node 11
// instruments automatically, so every scan gets a `db` child span under the
// `analytics.scan` span in tools.ts. `npm run db:seed` fills the table from
// the deterministic generator in ./generate.

import { Pool } from "pg";
import { METRICS, type MetricDef } from "./generate.ts";

export { METRICS, renderCatalog, type MetricDef } from "./generate.ts";

const RANGE_DAYS = 90;

export type Row = { date: string; value: number } & Record<string, string | number>;

export class AnalyticsQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsQueryError";
  }
}

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso(): string {
  return isoDate(new Date());
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function validateQuery(args: {
  metric: string;
  from: string;
  to: string;
  groupBy?: string;
}): { def: MetricDef; rangeDays: number } {
  const { metric, from, to, groupBy } = args;
  const def = METRICS.find((m) => m.name === metric);
  if (!def) {
    throw new AnalyticsQueryError(
      `Unknown metric "${metric}". Known metrics: ${METRICS.map((m) => m.name).join(", ")}.`,
    );
  }
  if (groupBy && !def.dimensions.includes(groupBy)) {
    throw new AnalyticsQueryError(
      `"${groupBy}" is not a dimension of ${metric}. Known dimensions: ${def.dimensions.join(", ")}.`,
    );
  }
  if (to < from) {
    throw new AnalyticsQueryError(`"to" (${to}) is before "from" (${from}).`);
  }
  const today = todayIso();
  if (to > today) {
    throw new AnalyticsQueryError(`"to" (${to}) is after today (${today}).`);
  }
  const rangeDays = daysBetweenInclusive(from, to);
  if (rangeDays > RANGE_DAYS) {
    throw new AnalyticsQueryError(
      `The range ${from} to ${to} is ${rangeDays} days, outside the 90-day retention window.`,
    );
  }
  return { def, rangeDays };
}

// Created on first scan(), not at import time, so importing this module -
// directly, or through agent.ts for SYSTEM_PROMPT - never requires
// DATABASE_URL or opens a connection.
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy the storefront's Neon URL into apps/slack-agent/.env.local and run npm run db:seed.",
      );
    }
    pool = new Pool({ connectionString: strictSslMode(connectionString) });
  }
  return pool;
}

export async function scan(args: {
  metric: string;
  from: string;
  to: string;
  groupBy?: string;
}): Promise<{ rows: Row[]; rangeDays: number }> {
  const { metric, from, to, groupBy } = args;
  const { rangeDays } = validateQuery(args);
  const client = getPool();

  if (groupBy) {
    const { rows } = await client.query(
      `SELECT date::text AS date, dimension_value, value FROM analytics_daily WHERE metric = $1 AND dimension = $4 AND date BETWEEN $2 AND $3 ORDER BY date, dimension_value`,
      [metric, from, to, groupBy],
    );
    return {
      rows: rows.map((row) => ({
        date: row.date,
        value: Number(row.value),
        [groupBy]: row.dimension_value,
      })),
      rangeDays,
    };
  }

  const { rows } = await client.query(
    `SELECT date::text AS date, value FROM analytics_daily WHERE metric = $1 AND dimension IS NULL AND date BETWEEN $2 AND $3 ORDER BY date`,
    [metric, from, to],
  );
  return {
    rows: rows.map((row) => ({ date: row.date, value: Number(row.value) })),
    rangeDays,
  };
}

export function total(rows: Row[], unit: MetricDef["unit"]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, row) => acc + row.value, 0);
  return unit === "rate" ? sum / rows.length : sum;
}

// pg 8 treats sslmode=require, the mode Neon puts in its URLs, as verify-full
// and warns on every start that the alias changes meaning in pg 9.
export function strictSslMode(connectionString: string): string {
  return connectionString.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
}
