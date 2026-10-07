#!/usr/bin/env node
// Creates the monitors from one template plus the workflow that notifies you.
//
//   node scripts/alerts/create.mjs <template> <org-slug> <project-slug> --email <user-id> [--slack <channel-id>] [--push]
//
// <template> is slack-agent or storefront (a file in this folder).
// <user-id> is your Sentry user id: sentry api organizations/<org>/members/
// prints every member with a "user": { "id": ... } field.
// --slack adds a Slack action on the connected Slack workspace. Its note
// mentions @Sentry, so Seer starts on the alert as soon as it posts.
// Without --push the script prints the payloads and sends nothing.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const [template, org, project] = args;
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const userId = option("--email");
const slackChannel = option("--slack");
const push = args.includes("--push");
if (!template || !org || !project || !userId) {
  console.error("usage: create.mjs <slack-agent|storefront> <org-slug> <project-slug> --email <user-id> [--slack <channel-id>] [--push]");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const { workflowName, detectors } = JSON.parse(readFileSync(join(here, `${template}.json`), "utf8"));

const actions = [
  { type: "email", data: {}, config: { targetType: "user", targetIdentifier: userId } },
];
if (slackChannel) {
  actions.push({
    type: "slack",
    data: { tags: "", notes: "@Sentry investigate this alert" },
    config: { targetType: "specific", targetIdentifier: slackChannel },
  });
}
const workflow = {
  name: workflowName,
  enabled: true,
  triggers: { logicType: "any-short", conditions: [{ type: "every_event", comparison: true, conditionResult: true }] },
  actionFilters: [{ logicType: "any", conditions: [], actions }],
};

function post(path, body) {
  const file = join(tmpdir(), `sentry-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(body));
  return JSON.parse(execFileSync("sentry", ["api", path, "--method", "POST", "--input", file], { encoding: "utf8" }));
}

if (!push) {
  console.log(JSON.stringify({ workflow, detectors }, null, 2));
  process.exit(0);
}

const { id: workflowId } = post(`organizations/${org}/workflows/`, workflow);
console.log(`workflow ${workflow.name}: https://${org}.sentry.io/monitors/alerts/${workflowId}/`);
for (const detector of detectors) {
  const { id } = post(`organizations/${org}/projects/${project}/detectors/`, { ...detector, workflowIds: [workflowId] });
  console.log(`monitor ${detector.name}: https://${org}.sentry.io/monitors/${id}/`);
}
