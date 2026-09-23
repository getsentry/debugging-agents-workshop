# Lab 3. Debug the refund that fails

10 minutes. Hands-on. Needs Lab 2.

## Step 1. Break it

In the storefront chat, as the demo user, ask:

> Show me my recent orders.

Then pick the oldest order in the list and ask:

> Refund order `<id>`.

The assistant apologizes and says the refund did not go through. To the
user, that is the whole story. It is not.

## Step 2. Let the agent find it

Ask your coding agent:

> There is a new issue in the storefront Sentry project from a failed refund
> in the chat. Find it, pull the full context including the trace and the
> replay, tell me which span failed and why, and propose a fix. Do not change
> code yet.

Watch what it pulls:

- The issue, with the stack trace pointing into `lib/db`.
- The trace: the agent span, the model step that decided to call
  `refundOrder`, the tool span, and under it the database query that
  returned no row.
- The replay, showing the apology the user saw.

The cause: the payments table only has rows for orders placed after the June
2026 payments launch. Older orders have nothing to refund against, and the
tool throws instead of telling the model so.

### What did the work

Your agent used Sentry's MCP server. With the plugin installed, the
`sentry-debug-issue` skill was its script. `search_issues` found the issue,
`get_trace_details` pulled the span tree, and `get_sentry_resource` fetched
the replay. Ask the agent to list the Sentry tools it called and these
names come back.

The `sentry` CLI shows the same issue from a terminal, and works in CI:

    sentry issue list --query "is:unresolved" <org>/<project>
    sentry issue view --spans all <ISSUE-ID>

## Step 3. Decide the fix, then apply it

There are two fixes, and the trace tells you which one is right:

1. The tool catches the missing payment and returns a message the model can
   relay: "this order predates online payments, contact support".
2. The seed data is wrong and older orders should have payments too.

For a shop, the first is correct. Ask your agent:

> Apply the first fix in `lib/ai/tools.ts`. Keep the error visible in Sentry
> as a handled tool error with the order id as an attribute. Then rerun the
> refund in the chat and show me the new trace.

## Step 4. Triage it

The fix in the repo is half of the job. The issue in Sentry needs an owner,
a root cause on record, and a resolution tied to the fix. Ask your agent:

> Triage the refund issue: assign it to me, run Seer on it and compare its
> root cause with yours, then resolve it and reference it in the fix commit
> so Sentry links the two.

Watch for two MCP calls: `analyze_issue_with_seer` for the root cause and
`update_issue` for the assignee and the status. From a terminal, the same
two are:

    sentry issue explain <ISSUE-ID>
    sentry issue resolve <ISSUE-ID>

A commit message with `Fixes <ISSUE-ID>` in it does the last step for you.
Sentry resolves the issue when the release with that commit goes out.

Seer only runs on a project with a connected repository. If it answers
"requires repositories to be connected", link your fork under Project
Settings > Source Code, or skip the Seer comparison and keep the rest.

## Checkpoint

The new trace has the same tool span, now without an error, and the model's
reply names the reason. The issue from Step 1 is resolved, assigned to you,
and shows the Seer analysis and the fix commit.

## What you learned

- The reply the user saw is the last span. The failure was three levels up.
- A trace with inputs, outputs, and db spans lets the agent diagnose without
  reproducing.
- Tool errors that the model recovers from still deserve to be recorded.
  Silent recovery is how agents hide failures.
- Debugging is tool calls. The MCP tools and CLI commands that found and
  triaged this issue run from any coding agent, and from CI.
