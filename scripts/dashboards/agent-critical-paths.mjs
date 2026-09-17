#!/usr/bin/env node
// Builds the "critical paths" dashboard for one instrumented app and pushes
// it with the sentry CLI. Lab 6 asks the coding agent to do this by prompt;
// this file is the presenter's reference for what "done" looks like.
//
//   node scripts/dashboards/agent-critical-paths.mjs <org-slug> <project-id> "<title>" [--push]
//
// Without --push it prints the JSON so you can compare it with the agent's.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [org, projectId, title = "Agent critical paths", flag] = process.argv.slice(2);
if (!org || !projectId) {
  console.error("usage: agent-critical-paths.mjs <org-slug> <project-id> [title] [--push]");
  process.exit(1);
}

const MODEL_CALLS = "span.op:gen_ai.generate_content";
const TOOL_CALLS = "span.op:gen_ai.execute_tool";
const CACHE_HIT =
  "equation|100 * sum(gen_ai.usage.cache_read.input_tokens) / sum(gen_ai.usage.input_tokens)";

function widget(title, displayType, query, layout, extra = {}) {
  return {
    title,
    displayType,
    widgetType: "spans",
    interval: "5m",
    limit: extra.limit ?? null,
    queries: [
      {
        name: "",
        fields: [...(query.columns ?? []), ...query.aggregates],
        columns: query.columns ?? [],
        aggregates: query.aggregates,
        fieldAliases: query.aliases ?? [],
        conditions: query.conditions,
        orderby: query.orderby ?? "",
      },
    ],
    layout: { minH: 1, ...layout },
  };
}

const dashboard = {
  title,
  projects: [Number(projectId)],
  environment: [],
  period: "24h",
  filters: {},
  widgets: [
    widget("Cache hit rate by release", "line",
      { columns: ["release"], aggregates: [CACHE_HIT], aliases: ["", "cached %"], conditions: MODEL_CALLS },
      { x: 0, y: 0, w: 3, h: 2 }),
    widget("Input tokens by release", "bar",
      { columns: ["release"], aggregates: ["sum(gen_ai.usage.input_tokens)"], conditions: MODEL_CALLS },
      { x: 3, y: 0, w: 3, h: 2 }),
    widget("Most expensive conversations", "table",
      {
        columns: ["gen_ai.conversation.id", "user.id"],
        aggregates: ["sum(gen_ai.usage.input_tokens)", "sum(gen_ai.usage.output_tokens)", "count()"],
        conditions: MODEL_CALLS,
        orderby: "-sum(gen_ai.usage.input_tokens)",
      },
      { x: 0, y: 2, w: 4, h: 2 }, { limit: 10 }),
    widget("Tool calls and failures", "table",
      {
        columns: ["gen_ai.tool.name"],
        aggregates: ["count()", "failure_count()", "p95(span.duration)"],
        conditions: TOOL_CALLS,
        orderby: "-failure_count()",
      },
      { x: 4, y: 2, w: 2, h: 2 }),
    widget("Model latency p95", "line",
      { columns: ["gen_ai.request.model"], aggregates: ["p95(span.duration)"], conditions: MODEL_CALLS },
      { x: 0, y: 4, w: 6, h: 2 }),
  ],
};

if (flag !== "--push") {
  console.log(JSON.stringify(dashboard, null, 2));
  process.exit(0);
}

const file = join(tmpdir(), `dashboard-${projectId}.json`);
writeFileSync(file, JSON.stringify(dashboard));
const out = execFileSync(
  "sentry",
  ["api", `organizations/${org}/dashboards/`, "--method", "POST", "--input", file],
  { encoding: "utf8" },
);
const { id } = JSON.parse(out);
console.log(`https://${org}.sentry.io/dashboard/${id}/`);
