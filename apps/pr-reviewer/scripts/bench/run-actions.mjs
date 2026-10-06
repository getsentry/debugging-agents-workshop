// node scripts/bench/run-actions.mjs --bench <id> --fixture <name|all> --variant <stock|fanout|all> [--n 5] [--gap <s>] [--ref main] [--dry-run]
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { expand, parseArgs, VARIANTS } from './args.mjs';

const args = parseArgs(process.argv.slice(2), { n: '5', gap: '0', ref: 'main', bench: `bench-${new Date().toISOString().slice(0, 10)}` });
if (!args.fixture || !args.variant) {
	console.error('usage: run-actions.mjs --fixture <name|all> --variant <stock|fanout|all> [--bench <id>] [--n 5] [--gap <s>] [--ref main] [--dry-run]');
	process.exit(2);
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
const fixtures = expand(
	args.fixture,
	readdirSync(new URL('../../fixtures/', import.meta.url)).filter((f) => f.endsWith('.diff') && f !== 'latest.diff').map((f) => f.replace(/\.diff$/, '')),
);
const gap = Number(args.gap);
const dry = args['dry-run'] === true;

async function waitForLastRun() {
	for (;;) {
		const runs = JSON.parse(gh('run', 'list', '--workflow', 'review-bench.yml', '--limit', '1', '--json', 'status'));
		if (!runs.length || runs[0].status === 'completed') return;
		await sleep(15);
	}
}

for (const variant of expand(args.variant, VARIANTS)) {
	for (let i = 1; i <= Number(args.n); i++) {
		for (const fixture of fixtures) {
			const cmd = ['workflow', 'run', 'review-bench.yml', '--ref', args.ref, '-f', `bench_id=${args.bench}`, '-f', `fixture=${fixture}`, '-f', `variant=${variant}`, '-f', `iteration=${i}`];
			if (dry) {
				console.log(`gh ${cmd.join(' ')}`);
				continue;
			}
			gh(...cmd);
			console.log(`dispatched ${fixture} ${variant} ${i}`);
			if (gap > 0) {
				await sleep(10);
				await waitForLastRun();
				await sleep(gap);
			}
		}
	}
}
