'use agent';

import '../sentry.ts';

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { useModel, useSubagent, useTool } from '@flue/runtime';
import * as v from 'valibot';

const execFileAsync = promisify(execFile);
const repoRoot = process.env.GITHUB_WORKSPACE ?? path.resolve(process.cwd(), '../..');

// Delegate agents stay unexported: every exported capitalized function in a
// 'use agent' module would register as a top-level agent in the Vite build.
function CorrectnessReviewer() {
	return (
		'You review a unified diff for correctness. The full diff arrives in your task message. ' +
		'Report only real defects: logic errors, off-by-one mistakes, dropped error handling, ' +
		'unhandled edge cases, and unintended behavior changes. For each finding give the file, ' +
		'the relevant added line, and why it is wrong. Reply with a Markdown bullet list, or ' +
		'"No correctness issues found." when the diff is clean.'
	);
}

function StyleReviewer() {
	return (
		'You review a unified diff for style and maintainability. The full diff arrives in your ' +
		'task message. Flag naming problems, outdated constructs, dead code, inconsistent ' +
		'formatting, and missing clarity — never correctness bugs. For each finding give the file, ' +
		'the relevant added line, and a concrete suggestion. Reply with a Markdown bullet list, or ' +
		'"No style issues found." when the diff is clean.'
	);
}

export function ReviewLead() {
	useModel('openrouter/anthropic/claude-sonnet-5');

	useSubagent({
		name: 'correctness-reviewer',
		description: 'Reviews a unified diff for logic errors, edge cases, and behavioral regressions.',
		agent: CorrectnessReviewer,
		model: 'openrouter/anthropic/claude-sonnet-5',
	});

	useSubagent({
		name: 'style-reviewer',
		description: 'Reviews a unified diff for naming, clarity, dead code, and consistency.',
		agent: StyleReviewer,
		model: 'openrouter/anthropic/claude-sonnet-5',
	});

	useTool({
		name: 'read_diff',
		description: 'Read a unified diff from a file path relative to the working directory.',
		input: v.object({ path: v.string() }),
		async run({ data, log }) {
			const diff = await readFile(data.path, 'utf8');
			log.info('diff loaded', { path: data.path, bytes: diff.length });
			return diff;
		},
	});

	useTool({
		name: 'read_file',
		description:
			'Reads one source file from the repository so a reviewer can see the whole file, not only the diff hunks.',
		input: v.object({ path: v.string() }),
		async run({ data, log }) {
			const contents = await readFile(path.resolve(repoRoot, data.path), 'utf8');
			log.info('file loaded', { path: data.path, bytes: contents.length });
			return contents.slice(0, 20000);
		},
	});

	useTool({
		name: 'run_tests',
		description: 'Run the demo-pr test suite and return its output',
		input: v.object({}),
		async run({ log }) {
			const reportPath = '/tmp/vitest.json';
			let exitCode = 0;
			try {
				await execFileAsync(
					'npx',
					['vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`],
					{ cwd: 'fixtures/demo-pr', maxBuffer: 64 * 1024 * 1024 },
				);
			} catch (error) {
				const failure = error as { code?: number };
				exitCode = typeof failure.code === 'number' ? failure.code : 1;
			}
			let output: string;
			try {
				const report = JSON.parse(await readFile(reportPath, 'utf8'));
				const failures = report.testResults.flatMap(
					(file: { name: string; assertionResults: { status: string; fullName: string }[] }) =>
						file.assertionResults
							.filter((test) => test.status === 'failed')
							.map((test) => `${path.basename(file.name)}: ${test.fullName}`),
				);
				output = JSON.stringify({
					passed: report.numPassedTests,
					failed: report.numFailedTests,
					failures,
				});
			} catch {
				output = `Tests failed to run (exit ${exitCode})`;
			}
			log.info('tests finished', { exitCode, bytes: output.length });
			return output;
		},
	});

	useTool({
		name: 'post_review',
		description: 'Publish the finished review. Call exactly once with the complete Markdown review.',
		input: v.object({ review: v.string() }),
		async run({ data, log }) {
			if (process.env.POST_TO_GITHUB === 'true') {
				const { GITHUB_REPOSITORY, PR_NUMBER, GITHUB_TOKEN } = process.env;
				const response = await fetch(
					`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${GITHUB_TOKEN}`,
							accept: 'application/vnd.github+json',
						},
						body: JSON.stringify({ body: data.review }),
					},
				);
				if (!response.ok) {
					throw new Error(`GitHub comment failed: ${response.status} ${await response.text()}`);
				}
				log.info('review posted to GitHub', {
					repository: GITHUB_REPOSITORY ?? '',
					pr: PR_NUMBER ?? '',
				});
				return `Review posted as a comment on ${GITHUB_REPOSITORY}#${PR_NUMBER}.`;
			}
			await writeFile('review.md', data.review);
			log.info('review written to disk', { path: 'review.md', bytes: data.review.length });
			return 'Review written to review.md (demo mode — set POST_TO_GITHUB=true to comment on the PR).';
		},
	});

	const prDescription = [process.env.PR_TITLE, process.env.PR_BODY]
		.filter(Boolean)
		.join('\n\n');

	return `You are the lead reviewer of a pull request. Work through these steps in order:

1. Load the diff with the read_diff tool, using the file path given in the user message.
2. For every file in the diff, call read_file with the path from its \`diff --git\` header so the
   reviewers see the whole file, not only the hunks. If a read fails, continue with the diff
   hunks for that file.
3. Delegate two review passes: one task to correctness-reviewer, one task to style-reviewer.
   Issue both tasks in a single batch so they run in parallel, and include the complete diff
   text and the full contents of the files you read in each task message — subagents cannot
   see this conversation.
4. Before you write the verdict, call run_tests once and report any failing tests in the
   Correctness section.
5. Synthesize everything into one review: a one-line verdict, then findings ordered by
   severity (correctness before style).
6. Publish the review with the post_review tool, exactly once.

${prDescription ? `PR description:\n---\n${prDescription}\n---\n\n` : ''}Finish by replying with the verdict line only.`;
}

// The agent's durable identity, which flue also reports as `gen_ai.agent.name`.
// Pinned to kebab-case so the lead groups alongside its two subagents in
// tracing views; the exported function stays capitalized because that is
// how the 'use agent' scan finds it.
ReviewLead.agentName = 'review-lead';
