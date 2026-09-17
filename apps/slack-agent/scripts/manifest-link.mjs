// Prints a link that pre-fills Slack's "create an app from a manifest" flow
// with this repo's manifest, so there's nothing to copy-paste by hand.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../slack-app-manifest.yaml", import.meta.url),
);
const manifest = readFileSync(manifestPath, "utf8");

console.log(
  `https://api.slack.com/apps?new_app=1&manifest_yaml=${encodeURIComponent(manifest)}`,
);
