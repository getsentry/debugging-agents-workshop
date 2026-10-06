// node scripts/bench/run-local.mjs --bench <id> --fixture <name|all> --variant <stock|fanout|all> [--n 5] [--gap <s>]
// Run from apps/pr-reviewer, like `npm run demo`.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expand, parseArgs, VARIANTS } from './args.mjs';

const args = parseArgs(process.argv.slice(2), { n: '5', gap: '0' });
if (!args.bench || !args.fixture || !args.variant) {
	console.error('usage: run-local.mjs --bench <id> --fixture <name|all> --variant <stock|fanout|all> [--n 5] [--gap <s>]');
	process.exit(2);
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const patch = 'apps/pr-reviewer/regressions/per-file-fanout.patch';
const reviewTs = 'apps/pr-reviewer/src/agents/review.ts';
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

if (git('status', '--porcelain', '--', reviewTs).trim()) {
	console.error(`${reviewTs} has uncommitted changes; refusing to run.`);
	process.exit(1);
}

const fixtures = expand(
	args.fixture,
	readdirSync('fixtures').filter((f) => f.endsWith('.diff') && f !== 'latest.diff').map((f) => f.replace(/\.diff$/, '')),
);
// flue reads .env on its own; the workshop keeps local keys in .env.local.
const envFile = existsSync('.env.local') ? ['--env', '.env.local'] : [];
const n = Number(args.n);
const gap = Number(args.gap);

// Variants run one after the other so the patch is applied once and always reverted.
for (const variant of expand(args.variant, VARIANTS)) {
	if (variant === 'fanout') git('apply', patch);
	const lastRun = new Map();
	try {
		for (let i = 1; i <= n; i++) {
			for (const fixture of fixtures) {
				const wait = gap - (Date.now() - (lastRun.get(fixture) ?? -Infinity)) / 1000;
				if (wait > 0 && lastRun.has(fixture)) await sleep(wait);
				const env = {
					...process.env,
					BENCH_ID: args.bench,
					BENCH_FIXTURE: fixture,
					BENCH_VARIANT: variant,
					BENCH_ITERATION: String(i),
					BENCH_RUN: randomUUID(),
				};
				delete env.POST_TO_GITHUB;
				const start = Date.now();
				const { status } = spawnSync(
					'npx',
					['flue', 'run', 'src/agents/review.ts', '--message', `Review the diff at fixtures/${fixture}.diff and post your review.`, ...envFile],
					{ env, stdio: 'ignore' },
				);
				lastRun.set(fixture, Date.now());
				console.log([fixture, variant, i, `exit=${status}`, `${((Date.now() - start) / 1000).toFixed(1)}s`].join('\t'));
			}
		}
	} finally {
		if (variant === 'fanout') git('apply', '-R', patch);
	}
}
