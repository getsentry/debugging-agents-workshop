import assert from "node:assert/strict";
import { test } from "node:test";
import { answerBlocks, fmtChange, type ToolOutcome } from "./blocks.ts";

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

// Reads the Chart.js config a chartUrl() call encoded into its `c` param.
function decodedChartConfig(imageUrl: string): { labels: string[]; datasets: unknown[] } {
  const query = new URL(imageUrl).searchParams;
  return JSON.parse(query.get("c")!).data;
}

test("compare_periods: 7-day series produces a card with a two-dataset chart", () => {
  const outcomes: ToolOutcome[] = [
    {
      toolName: "compare_periods",
      input: { metric: "signups", current: {}, previous: {} },
      output: {
        metric: "signups",
        current: { from: daysAgo(6), to: daysAgo(0), total: 1500 },
        previous: { from: daysAgo(13), to: daysAgo(7), total: 1300 },
        change: { absolute: 200, percent: 15.4 },
        series: {
          current: [200, 210, 220, 230, 210, 200, 230],
          previous: [180, 190, 200, 190, 180, 180, 180],
        },
      },
    },
  ];

  const blocks = answerBlocks(outcomes);
  const card = blocks[0] as { type: string; title: { text: string }; hero_image?: { image_url: string } };
  assert.equal(card.type, "card");
  assert.ok(card.title.text.includes("▲"));
  assert.ok(card.hero_image, "expected a hero_image");
  assert.ok(card.hero_image!.image_url.startsWith("https://quickchart.io/chart?"));
  assert.ok(card.hero_image!.image_url.length < 3000);

  const data = decodedChartConfig(card.hero_image!.image_url);
  assert.equal(data.datasets.length, 2);
});

test("compare_periods: a 90-day series is bucketed to stay under the URL limit", () => {
  const days = 90;
  const series = Array.from({ length: days }, (_, i) => 100 + i);
  const outcomes: ToolOutcome[] = [
    {
      toolName: "compare_periods",
      input: { metric: "active_users", current: {}, previous: {} },
      output: {
        metric: "active_users",
        current: { from: daysAgo(days - 1), to: daysAgo(0), total: 9000 },
        previous: { from: daysAgo(2 * days - 1), to: daysAgo(days), total: 8500 },
        change: { absolute: 500, percent: 5.9 },
        series: { current: series, previous: series },
      },
    },
  ];

  const blocks = answerBlocks(outcomes);
  const card = blocks[0] as { hero_image?: { image_url: string } };
  assert.ok(card.hero_image, "expected a hero_image after bucketing");

  const data = decodedChartConfig(card.hero_image!.image_url);
  assert.equal(data.labels.length, 13);
});

test("query_metric: grouped output produces a card and a table of groups", () => {
  const outcomes: ToolOutcome[] = [
    {
      toolName: "query_metric",
      input: {},
      output: {
        metric: "signups",
        from: daysAgo(6),
        to: daysAgo(0),
        groupBy: "plan",
        rowCount: 21,
        total: 1500,
        rows: [
          { date: daysAgo(6), value: 100, plan: "free" },
          { date: daysAgo(6), value: 50, plan: "team" },
          { date: daysAgo(6), value: 20, plan: "enterprise" },
        ],
        groupTotals: [
          { plan: "free", total: 900, share: 0.6 },
          { plan: "team", total: 450, share: 0.3 },
          { plan: "enterprise", total: 150, share: 0.1 },
        ],
      },
    },
  ];

  const blocks = answerBlocks(outcomes);
  assert.equal(blocks[0].type, "card");
  const table = blocks[1] as { type: string; rows: { text: string }[][] };
  assert.equal(table.type, "table");
  assert.equal(table.rows.length, 4);
  for (const dataRow of table.rows.slice(1)) {
    assert.ok(dataRow[2].text.endsWith("%"));
  }
});

test("top_movers: 12 movers produces a 11-row table and a bar chart card", () => {
  const movers = Array.from({ length: 12 }, (_, i) => ({
    device: `device-${i}`,
    before: 100 - i,
    after: 100 - i * 2,
    change: { absolute: -i, percent: -i * 1.5 },
  }));
  const outcomes: ToolOutcome[] = [
    {
      toolName: "top_movers",
      input: {},
      output: {
        metric: "checkout_conversion",
        dimension: "device",
        from: daysAgo(13),
        to: daysAgo(0),
        movers,
      },
    },
  ];

  const blocks = answerBlocks(outcomes);
  const table = blocks[0] as { type: string; rows: unknown[][] };
  assert.equal(table.type, "table");
  assert.equal(table.rows.length, 11);

  const card = blocks[1] as { type: string; hero_image?: { image_url: string } };
  assert.equal(card.type, "card");
  assert.ok(card.hero_image, "expected a hero_image");
  const config = JSON.parse(new URL(card.hero_image!.image_url).searchParams.get("c")!);
  assert.equal(config.type, "bar");
  assert.equal(config.options.indexAxis, "y");
});

test("fmtChange formats a negative rate change with points and a real minus sign", () => {
  assert.equal(
    fmtChange({ absolute: -0.004, percent: -12.5 }, "rate"),
    "▼ −0.4 pt (−12.5%)",
  );
});

test("an empty query or movers result adds no blocks instead of throwing", () => {
  const outcomes: ToolOutcome[] = [
    {
      toolName: "query_metric",
      input: { metric: "signups", from: daysAgo(7), to: daysAgo(1) },
      output: {
        metric: "signups",
        from: daysAgo(7),
        to: daysAgo(1),
        groupBy: null,
        rowCount: 0,
        total: 0,
        rows: [],
      },
    },
    {
      toolName: "top_movers",
      input: { metric: "signups", dimension: "plan", from: daysAgo(7), to: daysAgo(1) },
      output: { metric: "signups", dimension: "plan", from: daysAgo(7), to: daysAgo(1), movers: [] },
    },
  ];
  assert.deepEqual(answerBlocks(outcomes), []);
});
