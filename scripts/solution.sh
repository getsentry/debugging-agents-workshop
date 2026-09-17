#!/usr/bin/env bash
# Apply a solution patch to its app and install the dependencies it adds.
#
# Usage: ./scripts/solution.sh <storefront|slack-agent|pr-reviewer>
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

app="${1:-}"
case "$app" in
  storefront)
    solution_dir="02-storefront"
    ;;
  slack-agent)
    solution_dir="04-slack-agent"
    ;;
  pr-reviewer)
    solution_dir="05-pr-reviewer"
    ;;
  *)
    echo "Usage: $0 <storefront|slack-agent|pr-reviewer>" >&2
    exit 1
    ;;
esac

patch_file="$repo_root/solutions/$solution_dir/instrumentation.patch"
if [[ ! -f "$patch_file" ]]; then
  echo "No patch file at $patch_file" >&2
  exit 1
fi

cd "$repo_root"
git apply --check "$patch_file"
git apply "$patch_file"

app_dir="$repo_root/apps/$app"
(cd "$app_dir" && npm install)

env_example="$app_dir/.env.example"
if [[ -f "$env_example" ]]; then
  echo "Set these env vars in apps/$app/.env.local:"
  grep '^SENTRY_' "$env_example" || true
fi
