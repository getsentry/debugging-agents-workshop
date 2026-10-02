// The deterministic generator behind the Lighthouse analytics warehouse.
// Every number below comes from a seeded PRNG, so the same endDate always
// produces the same rows: `npm run db:seed` reruns this and reloads
// Postgres, and a presenter who reseeds on the workshop day gets the same
// story, just shifted to end on that day. No Sentry, no pg, no I/O here.

const RANGE_DAYS = 90;
const SEED = 1337424242;

// mulberry32: a small, fast, seeded PRNG. Good enough for fake data, not for
// anything that needs real randomness.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// A multiplicative jitter of +/- spread around 1, e.g. noise(rng, 0.1) is
// somewhere between 0.9x and 1.1x.
function noise(rng: () => number, spread: number): number {
  return 1 + (rng() - 0.5) * 2 * spread;
}

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Weekend traffic runs lower across every metric here. Built from the real
// day of week, not the day offset, so a Saturday is always a Saturday.
function weekendMultiplier(dateIso: string): number {
  const day = new Date(`${dateIso}T00:00:00`).getDay();
  return day === 0 || day === 6 ? 0.8 : 1;
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

type DayRecord = { date: string; offsetFromEnd: number };

// 90 days ending at endDate, oldest first. Indexed by offsetFromEnd (0 =
// endDate, 89 = the oldest day) rather than by the calendar date, so the
// story below - the release windows, the regression, the recovery - always
// lands on the same relative days no matter which endDate is passed in.
function buildDays(endDate: string): DayRecord[] {
  const end = new Date(`${endDate}T00:00:00`);
  const days: DayRecord[] = [];
  for (let offsetFromEnd = RANGE_DAYS - 1; offsetFromEnd >= 0; offsetFromEnd--) {
    const d = new Date(end);
    d.setDate(d.getDate() - offsetFromEnd);
    days.push({ date: isoDate(d), offsetFromEnd });
  }
  return days;
}

// Only v1.4.2's and v1.4.3's start were specified (12 and 3 days before the
// end); the v1.4.0/v1.4.1 boundary is an even split of the remaining days so
// the four releases tile the full 90-day window with no gaps or overlap.
const RELEASE_WINDOWS = [
  { release: "v1.4.0", minOffset: 51, maxOffset: 89 },
  { release: "v1.4.1", minOffset: 13, maxOffset: 50 },
  { release: "v1.4.2", minOffset: 4, maxOffset: 12 },
  { release: "v1.4.3", minOffset: 0, maxOffset: 3 },
] as const;

// The day v1.4.2 shipped. page_views on /pricing and checkout_conversion on
// mobile stay degraded from here through endDate; only error_rate recovers,
// in the v1.4.3 window.
const DEGRADED_SINCE_OFFSET = 12;

function releaseForOffset(offsetFromEnd: number): string {
  const window = RELEASE_WINDOWS.find(
    (w) => offsetFromEnd >= w.minOffset && offsetFromEnd <= w.maxOffset,
  );
  if (!window) throw new Error(`No release window covers offset ${offsetFromEnd}`);
  return window.release;
}

export type MetricDef = {
  name: string;
  description: string;
  unit: "count" | "rate";
  dimensions: string[];
  glossary: string;
};

export const METRICS: MetricDef[] = [
  {
    name: "signups",
    description: "New account signups per day, by plan and by signup country.",
    unit: "count",
    dimensions: ["plan", "country"],
    glossary:
      "signups counts a new account the moment it verifies its email, in the " +
      "region where the day boundary is UTC-8 (Lighthouse's primary market). " +
      "The plan dimension is the plan the account chose at signup, not its " +
      "current plan - a free signup that upgrades a week later still counts " +
      "as a free signup that day, because upgrades show up in a separate " +
      "revenue metric, not here. The country dimension comes from the " +
      "signup form's billing country field, not IP geolocation, so it is " +
      "accurate but self-reported. Expect signups to dip on weekends and on " +
      "major US holidays; a dip on an ordinary weekday is the signal worth " +
      "chasing, a dip on a Saturday is not.",
  },
  {
    name: "active_users",
    description: "Daily active users by platform (web, iOS, Android).",
    unit: "count",
    dimensions: ["platform"],
    glossary:
      "active_users counts an authenticated session with at least one " +
      "in-app action that day, per platform. A person who opens both the " +
      "web app and the iOS app on the same day counts once in each " +
      "platform's total, so summing the three platforms overstates true " +
      "unique headcount by the size of that overlap; use this metric to " +
      "compare a platform against its own history, not to add the " +
      "platforms together. A native app store update can gate a release " +
      "behind review for a day or two, which shows up here as a temporary " +
      "dip in ios or android even when nothing in the product changed.",
  },
  {
    name: "page_views",
    description: "Page views on the marketing site and app shell, by path.",
    unit: "count",
    dimensions: ["path"],
    glossary:
      "page_views counts a rendered page load after bot and crawler traffic " +
      "is filtered out, by path. /pricing is the page with the clearest " +
      "purchase intent, so a drop there is worth more attention than an " +
      "equivalent drop on /blog. Because this metric counts views of a " +
      "path, not a fixed page, a release that restructures the pricing " +
      "page (a new URL, a redirect, a modal instead of a page) can move " +
      "this number on its own, with no change in how many people actually " +
      "wanted to see pricing.",
  },
  {
    name: "checkout_conversion",
    description: "Share of checkout sessions that complete purchase, by device.",
    unit: "rate",
    dimensions: ["device"],
    glossary:
      "checkout_conversion is completed purchases divided by checkout " +
      "sessions started, by device - the denominator is people who already " +
      "reached checkout, not every site visitor, so this tracks the " +
      "checkout flow itself rather than general purchase interest. Mobile " +
      "conversion normally runs lower than desktop; the two devices are not " +
      "expected to match. A regression introduced in the mobile checkout " +
      "flow - a broken form field, a slow payment step - shows up here " +
      "before it shows up anywhere in reported revenue, because revenue " +
      "lags a day or two behind the sessions that produced it.",
  },
  {
    name: "error_rate",
    description: "Application error rate (5xx and unhandled client errors) by release.",
    unit: "rate",
    dimensions: ["release"],
    glossary:
      "error_rate is errored requests divided by total requests, for " +
      "whichever release was serving traffic that day. In this warehouse " +
      "exactly one release serves all traffic on any given day - there is " +
      "no canary or gradual rollout to blend into the number - so a spike " +
      "right after a release starts almost always means the release " +
      "itself, not a coincidence. A release's window begins the day it " +
      "ships and ends the day the next one ships; querying error_rate " +
      "grouped by release compares whole releases against each other, not " +
      "individual days.",
  },
];

type SeriesRow = { date: string; value: number };

type ShareSpec = {
  value: string;
  share: number;
  // Multiplier applied on top of the day's baseline share, keyed by how
  // many days ago the day is. Used for the release-4-onward degradations.
  storyMultiplier?: (offsetFromEnd: number) => number;
};

type MetricSeries = {
  total: SeriesRow[];
  byDimension: Record<string, Record<string, SeriesRow[]>>;
};

function buildCountSeries(
  days: DayRecord[],
  rng: () => number,
  baseline: number,
  noiseSpread: number,
  dimensions: Record<string, ShareSpec[]>,
): MetricSeries {
  const total: SeriesRow[] = [];
  const byDimension: Record<string, Record<string, SeriesRow[]>> = {};
  for (const [dim, specs] of Object.entries(dimensions)) {
    byDimension[dim] = {};
    for (const spec of specs) byDimension[dim][spec.value] = [];
  }

  for (const day of days) {
    const dayValue = Math.round(
      baseline * weekendMultiplier(day.date) * noise(rng, noiseSpread),
    );
    total.push({ date: day.date, value: dayValue });

    for (const [dim, specs] of Object.entries(dimensions)) {
      for (const spec of specs) {
        const storyFactor = spec.storyMultiplier?.(day.offsetFromEnd) ?? 1;
        const value = Math.round(
          dayValue * spec.share * storyFactor * noise(rng, noiseSpread),
        );
        byDimension[dim][spec.value].push({ date: day.date, value });
      }
    }
  }

  return { total, byDimension };
}

function buildCheckoutConversion(days: DayRecord[], rng: () => number): MetricSeries {
  const devices = [
    { value: "desktop", base: 0.05, trafficShare: 0.6 },
    {
      value: "mobile",
      base: 0.032,
      trafficShare: 0.4,
      storyMultiplier: (offsetFromEnd: number) =>
        offsetFromEnd <= DEGRADED_SINCE_OFFSET ? 0.8 : 1,
    },
  ];

  const total: SeriesRow[] = [];
  const byDimension: Record<string, Record<string, SeriesRow[]>> = { device: {} };
  for (const device of devices) byDimension.device[device.value] = [];

  for (const day of days) {
    let blended = 0;
    for (const device of devices) {
      const storyFactor = device.storyMultiplier?.(day.offsetFromEnd) ?? 1;
      const value = roundRate(
        device.base * weekendMultiplier(day.date) * storyFactor * noise(rng, 0.06),
      );
      byDimension.device[device.value].push({ date: day.date, value });
      blended += value * device.trafficShare;
    }
    total.push({ date: day.date, value: roundRate(blended) });
  }

  return { total, byDimension };
}

function buildErrorRate(days: DayRecord[], rng: () => number): MetricSeries {
  const baseline = 0.008;
  const total: SeriesRow[] = [];
  const byDimension: Record<string, Record<string, SeriesRow[]>> = { release: {} };
  for (const window of RELEASE_WINDOWS) byDimension.release[window.release] = [];

  for (const day of days) {
    const release = releaseForOffset(day.offsetFromEnd);
    // v1.4.2 doubles the error rate; v1.4.3 recovers it. v1.4.0 and v1.4.1
    // are unaffected baseline.
    const storyFactor = release === "v1.4.2" ? 2 : 1;
    const value = roundRate(
      baseline * weekendMultiplier(day.date) * storyFactor * noise(rng, 0.12),
    );
    total.push({ date: day.date, value });
    byDimension.release[release].push({ date: day.date, value });
  }

  return { total, byDimension };
}

function buildWarehouse(days: DayRecord[], rng: () => number): Record<string, MetricSeries> {
  // Built in this fixed order, against one shared rng, so the numbers below
  // never change between two calls with the same endDate.
  return {
    signups: buildCountSeries(days, rng, 220, 0.1, {
      plan: [
        { value: "free", share: 0.6 },
        { value: "team", share: 0.3 },
        { value: "enterprise", share: 0.1 },
      ],
      country: [
        { value: "US", share: 0.4 },
        { value: "DE", share: 0.15 },
        { value: "FR", share: 0.15 },
        { value: "GB", share: 0.15 },
        { value: "BR", share: 0.15 },
      ],
    }),
    active_users: buildCountSeries(days, rng, 6000, 0.06, {
      platform: [
        { value: "web", share: 0.5 },
        { value: "ios", share: 0.3 },
        { value: "android", share: 0.2 },
      ],
    }),
    page_views: buildCountSeries(days, rng, 25000, 0.08, {
      path: [
        { value: "/", share: 0.35 },
        {
          value: "/pricing",
          share: 0.15,
          storyMultiplier: (offsetFromEnd) =>
            offsetFromEnd <= DEGRADED_SINCE_OFFSET ? 0.65 : 1,
        },
        { value: "/docs", share: 0.2 },
        { value: "/signup", share: 0.1 },
        { value: "/blog", share: 0.15 },
        { value: "/changelog", share: 0.05 },
      ],
    }),
    checkout_conversion: buildCheckoutConversion(days, rng),
    error_rate: buildErrorRate(days, rng),
  };
}

export type WarehouseRow = {
  metric: string;
  date: string;
  dimension: string | null;
  dimensionValue: string | null;
  value: number;
};

// 90 days ending at endDate inclusive. Totals rows have dimension null;
// per-dimension rows have dimension and dimensionValue set. A fresh rng
// seeded the same way every call, so two calls with the same endDate
// produce the same rows.
export function generateWarehouse(endDate: string): WarehouseRow[] {
  const days = buildDays(endDate);
  const warehouse = buildWarehouse(days, mulberry32(SEED));

  const rows: WarehouseRow[] = [];
  for (const [metric, series] of Object.entries(warehouse)) {
    for (const row of series.total) {
      rows.push({ metric, date: row.date, dimension: null, dimensionValue: null, value: row.value });
    }
    for (const [dimension, byValue] of Object.entries(series.byDimension)) {
      for (const [dimensionValue, dimRows] of Object.entries(byValue)) {
        for (const row of dimRows) {
          rows.push({ metric, date: row.date, dimension, dimensionValue, value: row.value });
        }
      }
    }
  }
  return rows;
}

export function renderCatalog(): string {
  return METRICS.map(
    (m) =>
      `${m.name} (${m.unit}). ${m.description} Dimensions: ${m.dimensions.join(", ")}.\n${m.glossary}`,
  ).join("\n\n");
}
