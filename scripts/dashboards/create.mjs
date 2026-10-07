#!/usr/bin/env node
// Creates one of the workshop dashboards in your Sentry org with the sentry CLI.
//
//   node scripts/dashboards/create.mjs <template> <org-slug> <project-id> [--push]
//
// <template> is slack-agent, storefront, or pr-reviewer (a file in this folder).
// Without --push the script prints the dashboard JSON and sends nothing.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [template, org, projectId, flag] = process.argv.slice(2);
if (!template || !org || !/^\d+$/.test(projectId ?? "")) {
  console.error("usage: create.mjs <slack-agent|storefront|pr-reviewer> <org-slug> <project-id> [--push]");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = JSON.parse(
  readFileSync(join(here, `${template}.json`), "utf8").replaceAll("{{PROJECT_ID}}", projectId),
);

if (flag !== "--push") {
  console.log(JSON.stringify(dashboard, null, 2));
  process.exit(0);
}

const file = join(tmpdir(), `dashboard-${template}-${projectId}.json`);
writeFileSync(file, JSON.stringify(dashboard));
const out = execFileSync(
  "sentry",
  ["api", `organizations/${org}/dashboards/`, "--method", "POST", "--input", file],
  { encoding: "utf8" },
);
const { id } = JSON.parse(out);
console.log(`https://${org}.sentry.io/dashboard/${id}/?project=-1`);
