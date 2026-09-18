// The whole Sentry setup for this app — the agent code makes no Sentry calls
// beyond the import in review.ts.

import { createOpenTelemetryInstrumentation } from '@flue/opentelemetry';
import { context, trace } from '@opentelemetry/api';
import { instrument } from '@flue/runtime';
import * as Sentry from '@sentry/node';

// pi-ai depends on the `openai` package, so Sentry's OpenAI integration (and
// the other AI provider integrations, which patch their SDKs directly) would
// double count every model call Flue's instrumentation already traces.
const AI_PROVIDER_INTEGRATIONS = new Set([
	'Anthropic_AI',
	'OpenAI',
	'Google_GenAI',
	'LangChain',
	'LangGraph',
	'VercelAI',
	'WorkersAI',
]);

function remapToolPayload(span: Parameters<NonNullable<Sentry.NodeOptions['beforeSendSpan']>>[0]) {
	const attributes = span.attributes;
	if (attributes) {
		for (const kind of ['arguments', 'result'] as const) {
			const raw = attributes[`flue.tool.call.${kind}`];
			if (raw !== undefined) {
				if (attributes[`gen_ai.tool.call.${kind}`] === undefined) {
					attributes[`gen_ai.tool.call.${kind}`] = raw;
				}
				delete attributes[`flue.tool.call.${kind}`];
			}
		}
	}
	return span;
}

Sentry.init({
	dsn: process.env.SENTRY_DSN,
	environment: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
	release: process.env.GITHUB_SHA,
	tracesSampleRate: 1,
	enableOpenTelemetrySetup: true,
	integrations: (defaults) => [
		...defaults.filter((integration) => !AI_PROVIDER_INTEGRATIONS.has(integration.name)),
		// Flue runs model calls outside the span context, so the raw fetch spans
		// would float as extra roots; the gen_ai.chat spans already cover them.
		Sentry.nativeNodeFetchIntegration({
			ignoreOutgoingRequests: (url) => url.startsWith('https://openrouter.ai/'),
		}),
	],
	beforeSendSpan: remapToolPayload,
});

Sentry.setUser({ id: process.env.GITHUB_ACTOR ?? 'local' });
Sentry.setTags({
	'github.repository': process.env.GITHUB_REPOSITORY ?? 'local',
	'github.pr': process.env.PR_NUMBER ?? 'none',
});

// Sentry's transport sends every span envelope inside `suppressTracing`, and
// on Node 22 that suppressed scope leaks into Flue's model-stream callbacks
// (Sentry 11.0.0-rc.0): every span started after the first envelope is dropped
// as unsampled. Clearing the flag before the adapter handles each event keeps
// the run in one trace.
const SUPPRESS_TRACING_KEY = '__SENTRY_SUPPRESS_TRACING__';
function allowTracing() {
	Sentry.getCurrentScope().setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: false });
}

// Registered before the OpenTelemetry adapter so it observes first and
// disposes *after* it: the runtime disposes in reverse order, and the
// adapter's dispose ends every still-open span synchronously, so the flush
// must run after that.
instrument({
	key: Symbol.for('workshop.sentry'),
	observe: allowTracing,
	interceptor: (_op, _ctx, next) => {
		allowTracing();
		return next();
	},
	async dispose() {
		await Sentry.flush(2000);
	},
});

// Flue starts each subagent task outside the lead's span context, so the
// adapter would open a new trace per subagent. Remember every invoke_agent
// span by session and hand the parent session's span back as the root.
const agentSpans = new Map<string, Sentry.Span>();
Sentry.getClient()?.on('spanStart', (span) => {
	const data = Sentry.spanToJSON(span).attributes ?? {};
	if (data['gen_ai.operation.name'] === 'invoke_agent' && typeof data['flue.session.name'] === 'string') {
		agentSpans.set(data['flue.session.name'], span);
	}
});

// enableOpenTelemetrySetup makes Sentry the global tracer provider, so the
// adapter's spans (registered here) flow into Sentry without further wiring.
instrument(
	createOpenTelemetryInstrumentation({
		resolveRootContext: (event) => {
			const parent =
				'parentSession' in event && typeof event.parentSession === 'string' ? agentSpans.get(event.parentSession) : undefined;
			return parent ? trace.setSpan(context.active(), parent) : undefined;
		},
	}),
);
