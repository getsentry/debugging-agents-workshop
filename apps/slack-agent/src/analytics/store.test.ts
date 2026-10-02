import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_PROMPT } from "../agent.ts";
import { generateWarehouse } from "./generate.ts";
import { AnalyticsQueryError, validateQuery } from "./store.ts";

function iso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const TODAY = iso(new Date());

test("generateWarehouse is deterministic for the same endDate", () => {
  const first = generateWarehouse(TODAY);
  const second = generateWarehouse(TODAY);
  assert.deepEqual(first, second);
});

test("the v1.4.2 story: error_rate under v1.4.2 is at least 1.6x error_rate under v1.4.1", () => {
  const rows = generateWarehouse(TODAY).filter(
    (row) => row.metric === "error_rate" && row.dimension === null,
  );
  const v142 = rows.filter((row) => row.date >= daysAgo(12) && row.date <= daysAgo(4));
  const v141 = rows.filter((row) => row.date >= daysAgo(50) && row.date <= daysAgo(13));
  const mean = (values: typeof rows) =>
    values.reduce((sum, row) => sum + row.value, 0) / values.length;
  const meanV142 = mean(v142);
  const meanV141 = mean(v141);
  assert.ok(
    meanV142 >= meanV141 * 1.6,
    `expected ${meanV142} to be at least 1.6x ${meanV141}`,
  );
});

test("an unknown metric is rejected", () => {
  assert.throws(
    () => validateQuery({ metric: "not_a_real_metric", from: daysAgo(1), to: TODAY }),
    AnalyticsQueryError,
  );
});

test("a groupBy outside the metric's dimensions is rejected", () => {
  assert.throws(
    () =>
      validateQuery({ metric: "signups", from: daysAgo(1), to: TODAY, groupBy: "device" }),
    AnalyticsQueryError,
  );
});

test("a to date before from is rejected", () => {
  assert.throws(
    () => validateQuery({ metric: "signups", from: daysAgo(1), to: daysAgo(2) }),
    AnalyticsQueryError,
  );
});

test("a to date after today is rejected", () => {
  const tomorrow = daysAgo(-1);
  assert.throws(
    () => validateQuery({ metric: "signups", from: daysAgo(1), to: tomorrow }),
    AnalyticsQueryError,
  );
});

test("a range longer than 90 days is rejected", () => {
  assert.throws(
    () => validateQuery({ metric: "signups", from: daysAgo(99), to: TODAY }),
    AnalyticsQueryError,
  );
});

test("SYSTEM_PROMPT is long enough for Anthropic's prompt cache", () => {
  assert.ok(
    SYSTEM_PROMPT.length >= 5000,
    `SYSTEM_PROMPT is ${SYSTEM_PROMPT.length} characters`,
  );
});
