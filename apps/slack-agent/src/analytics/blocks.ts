// Turns this turn's tool results into the chart-and-table attachment that
// closes every reply. The chart is a QuickChart image: the bot only builds
// the URL, Slack's own servers fetch the pixels, so there is no HTTP call
// here and no risk of the chart slowing down the reply.

import type { CardBlock, KnownBlock, RawTextElement, TableBlock } from "@slack/types";
import { dailySeries } from "./tools.ts";
import { METRICS, type MetricDef, type Row } from "./store.ts";

export type ToolOutcome = { toolName: string; input: unknown; output: unknown };

type ChangeOf = { absolute: number; percent: number | null };

// The last 6 outcomes are the ones a reader can still connect to the text
// above them; anything older is history the reply already summarized.
const MAX_OUTCOMES = 6;

const CURRENT_COLOR = "#6C5FC7";
const PREVIOUS_COLOR = "#9E9AB8";
const GROUP_COLORS = ["#6C5FC7", "#F5A623", "#2BA3B3", "#E1567C", "#7BC96F", "#9E9AB8"];
const MAX_CHART_URL_LENGTH = 3000;
const MAX_MRKDWN_LENGTH = 200;
const DOWNSAMPLE_THRESHOLD = 45;
const BUCKET_SIZE = 7;

export function answerBlocks(outcomes: ToolOutcome[]): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  for (const outcome of outcomes.slice(-MAX_OUTCOMES)) {
    if (typeof outcome.output !== "object" || outcome.output === null) continue;
    switch (outcome.toolName) {
      case "compare_periods":
        blocks.push(...comparePeriodsBlocks(outcome.output as CompareOutput, outcome.input));
        break;
      case "query_metric":
        blocks.push(...queryMetricBlocks(outcome.output as QueryOutput));
        break;
      case "top_movers":
        blocks.push(...topMoversBlocks(outcome.output as TopMoversOutput));
        break;
      case "list_metrics":
        blocks.push(...listMetricsBlocks(outcome.output as ListMetricsOutput));
        break;
      default:
        break;
    }
  }
  return blocks;
}

// Chart.js v4 config, url-encoded into a QuickChart GET request. Slack shows a
// card hero image in a 4:3 box and crops anything wider, so the chart is drawn
// at that ratio, small enough that its fonts stay readable once scaled. Block Kit
// rejects an image URL of 3000 characters or more, so a chart that would
// need one is dropped rather than sent broken.
export function chartUrl(
  config: object,
  size: { w: number; h: number } = { w: 400, h: 300 },
): string | undefined {
  const url =
    `https://quickchart.io/chart?v=4&bkg=white&w=${size.w}&h=${size.h}` +
    `&c=${encodeURIComponent(JSON.stringify(config))}`;
  return url.length < MAX_CHART_URL_LENGTH ? url : undefined;
}

// ---- formatting helpers -----------------------------------------------

function label(metric: string): string {
  const spaced = metric.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function fmt(value: number, unit: MetricDef["unit"]): string {
  if (unit === "rate") return `${(value * 100).toFixed(1)}%`;
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function fmtShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

// Intl formats a negative sign as a plain hyphen; swap it for a real minus
// sign so the number reads right in Slack's font.
function signed(value: number, decimals: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    signDisplay: "exceptZero",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return formatted.replace("-", "−");
}

export function fmtChange(change: ChangeOf, unit: MetricDef["unit"]): string {
  const marker = change.absolute > 0 ? "▲" : change.absolute < 0 ? "▼" : "–";
  const percentText = change.percent === null ? "" : ` (${signed(change.percent, 1)}%)`;
  if (unit === "rate") {
    return `${marker} ${signed(change.absolute * 100, 1)} pt${percentText}`;
  }
  return `${marker} ${signed(Math.round(change.absolute), 0)}${percentText}`;
}

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

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function rangeLabel(from: string, to: string): string {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const fromText = `${month(fromDate)} ${fromDate.getDate()}`;
  const toText = `${month(toDate)} ${toDate.getDate()}`;
  if (fromDate.getFullYear() !== toDate.getFullYear()) {
    return `${fromText}, ${fromDate.getFullYear()} to ${toText}, ${toDate.getFullYear()}`;
  }
  return `${fromText} to ${toText}, ${toDate.getFullYear()}`;
}

// x-axis tick label for one date, no year: "Sep 21".
function xLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function unitOf(metric: string): MetricDef["unit"] {
  return METRICS.find((m) => m.name === metric)?.unit ?? "count";
}

// mrkdwn text objects for card title/subtitle/body all share the same
// 200-character ceiling, so every one of them goes through here.
function mrkdwn(text: string): { type: "mrkdwn"; text: string } {
  const clipped = text.length > MAX_MRKDWN_LENGTH ? `${text.slice(0, MAX_MRKDWN_LENGTH - 1)}…` : text;
  return { type: "mrkdwn", text: clipped };
}

function row(...cells: string[]): RawTextElement[] {
  return cells.map((text) => ({ type: "raw_text", text }));
}

function heroImage(url: string | undefined, altText: string): Pick<CardBlock, "hero_image"> {
  return url ? { hero_image: { type: "image", image_url: url, alt_text: altText } } : {};
}

// A week of consecutive points collapses into one, dated by the week's first
// day: summed for a count metric, averaged for a rate. Keeps a 90-day chart
// under the QuickChart URL limit.
function weeklyBuckets(
  points: { date: string; value: number }[],
  unit: MetricDef["unit"],
): { date: string; value: number }[] {
  const buckets: { date: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += BUCKET_SIZE) {
    const chunk = points.slice(i, i + BUCKET_SIZE);
    const sum = chunk.reduce((acc, p) => acc + p.value, 0);
    buckets.push({ date: chunk[0].date, value: unit === "rate" ? sum / chunk.length : sum });
  }
  return buckets;
}

type LineSeries = {
  label: string;
  points: { date: string; value: number }[];
  color: string;
  dashed?: boolean;
};

// One line chart config shared by compare_periods and query_metric. Every
// series in the chart is bucketed the same way, so the lines stay aligned
// point for point even after downsampling.
function lineChartConfig(series: LineSeries[], unit: MetricDef["unit"]): object {
  const needsBucketing = series.some((s) => s.points.length > DOWNSAMPLE_THRESHOLD);
  const points = needsBucketing
    ? series.map((s) => weeklyBuckets(s.points, unit))
    : series.map((s) => s.points);
  const labels = (points[0] ?? []).map((p) => xLabel(p.date));
  const scale = unit === "rate" ? 100 : 1;

  return {
    type: "line",
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: points[i].map((p) => p.value * scale),
        borderColor: s.color,
        backgroundColor: s.color,
        borderDash: s.dashed ? [6, 4] : undefined,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
        fill: false,
      })),
    },
    options: {
      plugins: { legend: { position: "bottom", labels: { font: { size: 14 } } } },
      scales: {
        x: { ticks: { font: { size: 13 }, maxRotation: 0, maxTicksLimit: 7 } },
        y: {
          grace: "10%",
          ticks: { font: { size: 13 } },
          ...(unit === "rate" ? { title: { display: true, text: "%" } } : {}),
        },
      },
    },
  };
}

function barChartConfig(bars: { label: string; value: number }[]): object {
  return {
    type: "bar",
    data: {
      labels: bars.map((b) => b.label),
      datasets: [
        {
          data: bars.map((b) => b.value),
          backgroundColor: "#6C5FC7",
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "% change" }, ticks: { font: { size: 13 } } },
        y: { ticks: { font: { size: 13 } } },
      },
    },
  };
}

// ---- compare_periods ----------------------------------------------------

type CompareOutput = {
  metric: string;
  current: { from: string; to: string; total: number };
  previous: { from: string; to: string; total: number };
  change: ChangeOf;
  series: { current: number[]; previous: number[] };
  groups?: (Record<string, unknown> & {
    current: number;
    previous: number;
    change: ChangeOf;
  })[];
};

function comparePeriodsBlocks(output: CompareOutput, input: unknown): KnownBlock[] {
  const unit = unitOf(output.metric);
  const currentDates = datesInRange(output.current.from, output.current.to);
  const previousDates = datesInRange(output.previous.from, output.previous.to);
  const currentPoints = currentDates.map((date, i) => ({
    date,
    value: output.series.current[i] ?? 0,
  }));
  const previousPoints = previousDates.map((date, i) => ({
    date,
    value: output.series.previous[i] ?? 0,
  }));

  const config = lineChartConfig(
    [
      {
        label: rangeLabel(output.current.from, output.current.to),
        points: currentPoints,
        color: CURRENT_COLOR,
      },
      {
        label: rangeLabel(output.previous.from, output.previous.to),
        points: previousPoints,
        color: PREVIOUS_COLOR,
        dashed: true,
      },
    ],
    unit,
  );
  const url = chartUrl(config);

  const card: CardBlock = {
    type: "card",
    ...heroImage(url, `${label(output.metric)} chart`),
    title: mrkdwn(`*${label(output.metric)}* ${fmtChange(output.change, unit)}`),
    subtitle: mrkdwn(
      `${rangeLabel(output.current.from, output.current.to)} vs ${rangeLabel(output.previous.from, output.previous.to)}`,
    ),
    body: mrkdwn(
      `Current ${fmt(output.current.total, unit)} · Previous ${fmt(output.previous.total, unit)}`,
    ),
  };

  const blocks: KnownBlock[] = [card];

  if (output.groups) {
    const groupBy = (input as { groupBy?: string } | undefined)?.groupBy ?? "group";
    const sorted = [...output.groups]
      .sort((a, b) => Math.abs(b.change.absolute) - Math.abs(a.change.absolute))
      .slice(0, 10);
    const table: TableBlock = {
      type: "table",
      column_settings: [{}, { align: "right" }, { align: "right" }, { align: "right" }],
      rows: [
        row(capitalize(groupBy), "Current", "Previous", "Change"),
        ...sorted.map((g) =>
          row(
            String(g[groupBy]),
            fmt(g.current, unit),
            fmt(g.previous, unit),
            fmtChange(g.change, unit),
          ),
        ),
      ],
    };
    blocks.push(table);
  }

  return blocks;
}

// ---- query_metric ---------------------------------------------------------

type GroupTotal = Record<string, unknown> & { total: number; share: number | null };

type QueryOutput = {
  metric: string;
  from: string;
  to: string;
  groupBy: string | null;
  rowCount: number;
  total: number;
  rows: Row[];
  groupTotals?: GroupTotal[];
};

function queryMetricBlocks(output: QueryOutput): KnownBlock[] {
  const unit = unitOf(output.metric);
  if (output.rows.length === 0) return [];
  const rangeDays = rangeDaysOf(output.from, output.to);
  const truncated = output.rowCount > output.rows.length;
  const verb = unit === "rate" ? "Average" : "Total";
  const subtitleText =
    `${verb} ${fmt(output.total, unit)} over ${rangeDays} days` +
    (truncated ? ` (first ${output.rows.length} rows)` : "");

  let bodyText: string;
  let config: object;

  if (output.groupBy && output.groupTotals) {
    const groupBy = output.groupBy;
    const topGroups = output.groupTotals.slice(0, 6);
    const top = output.groupTotals[0];
    bodyText =
      `${output.groupTotals.length} ${groupBy}s · top: ${String(top[groupBy])} ${fmt(top.total, unit)}` +
      (top.share === null ? "" : ` (${fmtShare(top.share)})`);
    config = lineChartConfig(
      topGroups.map((g, i) => ({
        label: String(g[groupBy]),
        points: dailySeries(
          output.rows.filter((r) => r[groupBy] === g[groupBy]),
          unit,
        ),
        color: GROUP_COLORS[i % GROUP_COLORS.length],
      })),
      unit,
    );
  } else {
    const series = dailySeries(output.rows, unit);
    const peak = series.reduce((a, b) => (b.value > a.value ? b : a));
    const low = series.reduce((a, b) => (b.value < a.value ? b : a));
    bodyText = `Peak ${fmt(peak.value, unit)} on ${xLabel(peak.date)} · Low ${fmt(low.value, unit)} on ${xLabel(low.date)}`;
    config = lineChartConfig(
      [{ label: label(output.metric), points: series, color: CURRENT_COLOR }],
      unit,
    );
  }

  const url = chartUrl(config);
  const card: CardBlock = {
    type: "card",
    ...heroImage(url, `${label(output.metric)} chart`),
    title: mrkdwn(`*${label(output.metric)}* · ${rangeLabel(output.from, output.to)}`),
    subtitle: mrkdwn(subtitleText),
    body: mrkdwn(bodyText),
  };

  const blocks: KnownBlock[] = [card];

  if (output.groupBy && output.groupTotals) {
    const groupBy = output.groupBy;
    const rows = output.groupTotals.slice(0, 10);
    const table: TableBlock =
      unit === "rate"
        ? {
            type: "table",
            column_settings: [{}, { align: "right" }],
            rows: [
              row(capitalize(groupBy), "Average"),
              ...rows.map((g) => row(String(g[groupBy]), fmt(g.total, unit))),
            ],
          }
        : {
            type: "table",
            column_settings: [{}, { align: "right" }, { align: "right" }],
            rows: [
              row(capitalize(groupBy), "Total", "Share"),
              ...rows.map((g) =>
                row(String(g[groupBy]), fmt(g.total, unit), fmtShare(g.share ?? 0)),
              ),
            ],
          };
    blocks.push(table);
  }

  return blocks;
}

// ---- top_movers -----------------------------------------------------------

type Mover = Record<string, unknown> & { before: number; after: number; change: ChangeOf };

type TopMoversOutput = {
  metric: string;
  dimension: string;
  from: string;
  to: string;
  movers: Mover[];
};

function topMoversBlocks(output: TopMoversOutput): KnownBlock[] {
  const unit = unitOf(output.metric);
  if (output.movers.length === 0) return [];
  const dimension = output.dimension;
  const rows = output.movers.slice(0, 10);
  const table: TableBlock = {
    type: "table",
    column_settings: [{}, { align: "right" }, { align: "right" }, { align: "right" }],
    rows: [
      row(capitalize(dimension), "First half", "Second half", "Change"),
      ...rows.map((m) =>
        row(
          String(m[dimension]),
          fmt(m.before, unit),
          fmt(m.after, unit),
          fmtChange(m.change, unit),
        ),
      ),
    ],
  };

  const bars = output.movers
    .filter((m) => m.change.percent !== null)
    .slice(0, 8)
    .map((m) => ({ label: String(m[dimension]), value: m.change.percent as number }));
  const url = chartUrl(barChartConfig(bars));

  const biggest = output.movers[0];
  const card: CardBlock = {
    type: "card",
    ...heroImage(url, `${label(output.metric)} movers chart`),
    title: mrkdwn(`*${label(output.metric)} movers by ${dimension}* · ${rangeLabel(output.from, output.to)}`),
    subtitle: mrkdwn("Second half vs first half"),
    body: mrkdwn(`Biggest mover: ${String(biggest[dimension])} ${fmtChange(biggest.change, unit)}`),
  };

  return [table, card];
}

// ---- list_metrics -----------------------------------------------------------

type ListMetricsOutput = {
  metrics: { name: string; unit: MetricDef["unit"]; dimensions: string[] }[];
};

function listMetricsBlocks(output: ListMetricsOutput): KnownBlock[] {
  const table: TableBlock = {
    type: "table",
    column_settings: [{}, {}, {}],
    rows: [
      row("Metric", "Unit", "Dimensions"),
      ...output.metrics.map((m) => row(m.name, m.unit, m.dimensions.join(", "))),
    ],
  };
  return [table];
}
