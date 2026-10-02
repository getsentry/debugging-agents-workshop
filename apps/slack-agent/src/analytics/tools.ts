import * as Sentry from "@sentry/node";
import { tool } from "ai";
import { z } from "zod";
import { METRICS, scan, total, type MetricDef, type Row } from "./store.ts";

// Labels shown next to each tool's task_update chunk while it runs, keyed by
// the tool names below (app.ts imports this for the Slack task timeline).
export const TOOL_TITLES: Record<string, string> = {
  list_metrics: "Listing the metrics catalog",
  query_metric: "Querying the warehouse",
  compare_periods: "Comparing two periods",
  top_movers: "Finding the top movers",
};

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeDaysOf(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function unitOf(metric: string): MetricDef["unit"] {
  return METRICS.find((m) => m.name === metric)?.unit ?? "count";
}

// One entry per distinct date, sorted ascending. A grouped query returns
// several rows per date, so counts are summed and rates are averaged across
// the rows on that date.
export function dailySeries(
  rows: Row[],
  unit: MetricDef["unit"],
): { date: string; value: number }[] {
  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    const forDate = byDate.get(row.date) ?? [];
    forDate.push(row);
    byDate.set(row.date, forDate);
  }
  return [...byDate.keys()].sort().map((date) => ({
    date,
    value: total(byDate.get(date)!, unit),
  }));
}

function changeOf(
  current: number,
  previous: number,
): { absolute: number; percent: number | null } {
  return {
    absolute: current - previous,
    percent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

// A scan's arguments and row count are the only things that stay useful in
// a trace where inputs and outputs are not recorded - a direct message. So
// every scan gets its own low-cardinality span, wrapped here once for all
// four tools, instead of the full query and its result.
async function scannedRows(args: {
  metric: string;
  from: string;
  to: string;
  groupBy?: string;
}): Promise<Row[]> {
  return Sentry.startSpan(
    {
      name: `scan ${args.metric}`,
      op: "analytics.scan",
      attributes: {
        "analytics.metric": args.metric,
        "analytics.range_days": rangeDaysOf(args.from, args.to),
        "analytics.group_by": args.groupBy ?? "none",
      },
    },
    async (span) => {
      const { rows } = await scan(args);
      span.setAttribute("analytics.row_count", rows.length);
      return rows;
    },
  );
}

function groupTotalsOf(rows: Row[], groupBy: string, unit: MetricDef["unit"]) {
  const values = new Set(rows.map((r) => String(r[groupBy])));
  const totals = [...values].map((value) => ({
    [groupBy]: value,
    total: total(
      rows.filter((r) => r[groupBy] === value),
      unit,
    ),
  }));
  const sumOfTotals = totals.reduce((sum, t) => sum + t.total, 0);
  return totals
    .map((t) => ({
      ...t,
      share: unit === "rate" ? null : sumOfTotals === 0 ? 0 : t.total / sumOfTotals,
    }))
    .sort((a, b) => b.total - a.total);
}

function totalsByGroup(
  currentRows: Row[],
  previousRows: Row[],
  groupBy: string,
  unit: MetricDef["unit"],
) {
  const values = new Set([
    ...currentRows.map((r) => String(r[groupBy])),
    ...previousRows.map((r) => String(r[groupBy])),
  ]);
  return [...values].map((value) => {
    const current = total(
      currentRows.filter((r) => r[groupBy] === value),
      unit,
    );
    const previous = total(
      previousRows.filter((r) => r[groupBy] === value),
      unit,
    );
    return { [groupBy]: value, current, previous, change: changeOf(current, previous) };
  });
}

// The midpoint date that splits [from, to] into two roughly equal halves.
function splitRange(from: string, to: string): { midBefore: string; midAfter: string } {
  const halfDays = Math.floor(rangeDaysOf(from, to) / 2);
  const fromDate = new Date(`${from}T00:00:00`);
  const midBefore = new Date(fromDate);
  midBefore.setDate(midBefore.getDate() + halfDays - 1);
  const midAfter = new Date(fromDate);
  midAfter.setDate(midAfter.getDate() + halfDays);
  return { midBefore: isoDate(midBefore), midAfter: isoDate(midAfter) };
}

const dateRange = z.object({
  from: z.string().describe("Inclusive start date, YYYY-MM-DD"),
  to: z.string().describe("Inclusive end date, YYYY-MM-DD"),
});

export const analyticsTools = {
  list_metrics: tool({
    description:
      "List every metric in the Lighthouse warehouse, with its unit and " +
      "the dimensions it can be grouped by. Call this before query_metric, " +
      "compare_periods, or top_movers if you are not already sure of the " +
      "exact metric name and dimension names.",
    inputSchema: z.object({}),
    execute: async () => ({
      metrics: METRICS.map(({ name, description, unit, dimensions }) => ({
        name,
        description,
        unit,
        dimensions,
      })),
    }),
  }),

  query_metric: tool({
    description:
      "Query one metric over a date range. from and to are inclusive ISO " +
      "dates, no more than 90 days apart, and to cannot be after today. " +
      "groupBy splits the result into one row per day per value of one of " +
      "the metric's dimensions; omit it for one row per day.",
    inputSchema: z.object({
      metric: z.string().describe("A metric name from list_metrics"),
      from: z.string().describe("Inclusive start date, YYYY-MM-DD"),
      to: z.string().describe("Inclusive end date, YYYY-MM-DD"),
      groupBy: z
        .string()
        .optional()
        .describe("One of the metric's dimensions, from list_metrics"),
    }),
    execute: async ({ metric, from, to, groupBy }) => {
      const unit = unitOf(metric);
      const rows = await scannedRows({ metric, from, to, groupBy });
      return {
        metric,
        from,
        to,
        groupBy: groupBy ?? null,
        rowCount: rows.length,
        total: total(rows, unit),
        rows: rows.slice(0, 200),
        groupTotals: groupBy ? groupTotalsOf(rows, groupBy, unit) : undefined,
      };
    },
  }),

  compare_periods: tool({
    description:
      "Compare one metric's total between a current date range and a " +
      "previous date range. Returns the total for each period, the " +
      "absolute change, and the percent change. Splits by one dimension " +
      "when groupBy is given.",
    inputSchema: z.object({
      metric: z.string().describe("A metric name from list_metrics"),
      current: dateRange,
      previous: dateRange,
      groupBy: z
        .string()
        .optional()
        .describe("One of the metric's dimensions, from list_metrics"),
    }),
    execute: async ({ metric, current, previous, groupBy }) => {
      const unit = unitOf(metric);
      const currentRows = await scannedRows({ metric, ...current, groupBy });
      const previousRows = await scannedRows({ metric, ...previous, groupBy });
      const currentTotal = total(currentRows, unit);
      const previousTotal = total(previousRows, unit);

      return {
        metric,
        current: { ...current, total: currentTotal },
        previous: { ...previous, total: previousTotal },
        change: changeOf(currentTotal, previousTotal),
        series: {
          current: dailySeries(currentRows, unit).map((r) => r.value),
          previous: dailySeries(previousRows, unit).map((r) => r.value),
        },
        groups: groupBy
          ? totalsByGroup(currentRows, previousRows, groupBy, unit)
          : undefined,
      };
    },
  }),

  top_movers: tool({
    description:
      "Split a date range in half and rank one dimension's values by how " +
      "much they moved from the first half to the second half, largest " +
      "absolute change first.",
    inputSchema: z.object({
      metric: z.string().describe("A metric name from list_metrics"),
      dimension: z
        .string()
        .describe("One of the metric's dimensions, from list_metrics"),
      from: z.string().describe("Inclusive start date, YYYY-MM-DD"),
      to: z.string().describe("Inclusive end date, YYYY-MM-DD"),
    }),
    execute: async ({ metric, dimension, from, to }) => {
      const unit = unitOf(metric);
      const { midBefore, midAfter } = splitRange(from, to);
      const beforeRows = await scannedRows({
        metric,
        from,
        to: midBefore,
        groupBy: dimension,
      });
      const afterRows = await scannedRows({
        metric,
        from: midAfter,
        to,
        groupBy: dimension,
      });

      const values = new Set([
        ...beforeRows.map((r) => String(r[dimension])),
        ...afterRows.map((r) => String(r[dimension])),
      ]);

      const movers = [...values]
        .map((value) => {
          const before = total(
            beforeRows.filter((r) => r[dimension] === value),
            unit,
          );
          const after = total(
            afterRows.filter((r) => r[dimension] === value),
            unit,
          );
          return { [dimension]: value, before, after, change: changeOf(after, before) };
        })
        .sort((a, b) => Math.abs(b.change.absolute) - Math.abs(a.change.absolute));

      return { metric, dimension, from, to, movers };
    },
  }),
};
