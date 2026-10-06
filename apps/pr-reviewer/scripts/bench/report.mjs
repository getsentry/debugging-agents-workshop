// node scripts/bench/report.mjs --bench <id> [--json]
// Reads the benchmark spans from Sentry (SENTRY_ORG / SENTRY_PROJECT override the defaults)
// and prices them with the OpenRouter model list.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from './args.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.bench) {
	console.error('usage: report.mjs --bench <id> [--json]');
	process.exit(2);
}

const org = process.env.SENTRY_ORG ?? 'sentry-developer-experience';
const project = process.env.SENTRY_PROJECT ?? 'debugging-agents-pr-reviewer';

function readToken() {
	if (process.env.SENTRY_AUTH_TOKEN) return process.env.SENTRY_AUTH_TOKEN;
	try {
		return execFileSync('sentry', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return undefined;
	}
}
const token = readToken();
if (!token) {
	console.error('SENTRY_AUTH_TOKEN is not set and `sentry auth token` failed.');
	process.exit(1);
}

const GROUP = ['bench.run', 'bench.fixture', 'bench.variant', 'bench.iteration'];

async function sentry(extra, fields) {
	const url = new URL(`https://sentry.io/api/0/organizations/${org}/events/`);
	url.searchParams.set('dataset', 'spans');
	url.searchParams.set('project', project);
	url.searchParams.set('statsPeriod', '14d');
	url.searchParams.set('per_page', '100');
	for (const f of [...GROUP, ...fields]) url.searchParams.append('field', f);
	url.searchParams.set('query', `bench.id:${args.bench} ${extra}`);
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) {
		console.error(`Sentry ${res.status}: ${(await res.text()).slice(0, 300)}`);
		process.exit(1);
	}
	return (await res.json()).data;
}

const runs = new Map();
const row = (r) => {
	if (!runs.has(r['bench.run'])) {
		runs.set(r['bench.run'], {
			run: r['bench.run'],
			fixture: r['bench.fixture'],
			variant: r['bench.variant'],
			iteration: r['bench.iteration'],
			input: 0, cached: 0, output: 0, calls: 0, agents: 0, seconds: 0,
		});
	}
	return runs.get(r['bench.run']);
};

// The project is filtered with a query term, so no numeric project id is needed.
const scope = `project:${project}`;
for (const r of await sentry(`${scope} span.op:gen_ai.chat`, [
	'sum(gen_ai.usage.input_tokens)', 'sum(gen_ai.usage.cache_read.input_tokens)', 'sum(gen_ai.usage.output_tokens)', 'count()',
])) {
	Object.assign(row(r), {
		input: r['sum(gen_ai.usage.input_tokens)'] ?? 0,
		cached: r['sum(gen_ai.usage.cache_read.input_tokens)'] ?? 0,
		output: r['sum(gen_ai.usage.output_tokens)'] ?? 0,
		calls: r['count()'] ?? 0,
	});
}
for (const r of await sentry(`${scope} span.op:gen_ai.invoke_agent`, ['count()'])) row(r).agents = r['count()'];
for (const r of await sentry(`${scope} is_transaction:true`, ['max(span.duration)'])) row(r).seconds = (r['max(span.duration)'] ?? 0) / 1000;

const model = readFileSync(new URL('../../src/agents/review.ts', import.meta.url), 'utf8').match(/openrouter\/([\w./-]+)/)?.[1];
const models = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
const pricing = models.find((m) => m.id === model)?.pricing;
if (!pricing) {
	console.error(`No OpenRouter pricing for model ${model}.`);
	process.exit(1);
}
const price = { prompt: Number(pricing.prompt), completion: Number(pricing.completion), cacheRead: Number(pricing.input_cache_read ?? pricing.prompt) };
// gen_ai.usage.input_tokens counts cached tokens, so the cached share is billed at the cache-read price.
const usd = (r) => (r.input - r.cached) * price.prompt + r.cached * price.cacheRead + r.output * price.completion;

const list = [...runs.values()].map((r) => ({ ...r, usd: usd(r) }));
const stat = (values) => {
	const v = [...values].sort((a, b) => a - b);
	const mid = v.length >> 1;
	const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
	return { median, min: v[0], max: v[v.length - 1] };
};
const cells = (values, digits = 0) => {
	const s = stat(values);
	return `${s.median.toFixed(digits)} (${s.min.toFixed(digits)}-${s.max.toFixed(digits)})`;
};

const groups = new Map();
for (const r of list) {
	const key = `${r.fixture}\t${r.variant}`;
	groups.set(key, [...(groups.get(key) ?? []), r]);
}
const table = [...groups.entries()].sort().map(([key, rs]) => {
	const [fixture, variant] = key.split('\t');
	return {
		fixture, variant, n: rs.length,
		input: cells(rs.map((r) => r.input)),
		cachedPct: cells(rs.map((r) => (r.input ? (100 * r.cached) / r.input : 0)), 1),
		output: cells(rs.map((r) => r.output)),
		calls: cells(rs.map((r) => r.calls)),
		agents: cells(rs.map((r) => r.agents)),
		seconds: cells(rs.map((r) => r.seconds), 1),
		usd: cells(rs.map((r) => r.usd), 4),
	};
});

const missing = [];
for (const [key, rs] of groups) {
	const have = new Set(rs.map((r) => Number(r.iteration)));
	for (let i = 1; i <= Math.max(...have); i++) if (!have.has(i)) missing.push(`${key.replace('\t', ' ')} iteration ${i}`);
}

if (args.json) {
	console.log(JSON.stringify({ bench: args.bench, model, price, runs: list, table, missing }, null, 2));
} else {
	console.log(`bench ${args.bench}, org ${org}, project ${project}`);
	console.log(`model ${model}: prompt ${price.prompt * 1e6} / completion ${price.completion * 1e6} / cache read ${price.cacheRead * 1e6} USD per 1M tokens`);
	console.log('fixture\tvariant\tn\tinput\tcached %\toutput\tmodel calls\tagent spans\tseconds\tUSD (median (min-max))');
	for (const t of table) console.log([t.fixture, t.variant, t.n, t.input, t.cachedPct, t.output, t.calls, t.agents, t.seconds, t.usd].join('\t'));
	if (missing.length) console.log(`missing runs: ${missing.join('; ')}`);
	if (!list.length) console.log('no runs found');
}
