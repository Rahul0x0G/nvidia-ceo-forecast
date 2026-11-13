// Quantile forecaster for Polymarket's "Next CEO of NVIDIA?" Yes prices (Node 22, standard library only, no network).
//
// Persistence centre (the price stays where it was at the checkpoint) with a random-walk spread that is scaled per
// market by how often that market's price actually moved over the last 24 hours: a market that sits still for hours
// gets a tight band, a busy one a wide band.
//
//   q_tau(h) = clamp(x + z_tau * S * sqrt(h) * ((f + 0.02) / 0.2), 0, 1), rounded to 6 decimals
//
// x is the price at the checkpoint, f the share of the last 1,440 minutes in which the price changed, S = 0.0015 and
// z_tau the standard normal's quantile at each level. Deterministic: no randomness, inputs read in name order.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Base spread in price units per square-root minute, for a market that moves in 20% of minutes. */
const SIGMA = 0.0015;
/** Look-back window, in minutes, for the share of minutes with a price change. */
const ACTIVITY_WINDOW = 1440;
/** The activity share the base spread is calibrated to, and a small floor added to the share. */
const ACTIVITY_REF = 0.2;
const ACTIVITY_FLOOR = 0.02;

interface CaseMarket {
  id: string;
  prices: number[];
}
interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** Share of the last ACTIVITY_WINDOW minutes in which the price differs from the minute before. */
function activity(p: number[]): number {
  const lo = Math.max(1, p.length - ACTIVITY_WINDOW);
  let moved = 0;
  let n = 0;
  for (let i = lo; i < p.length; i++) {
    if (p[i] !== p[i - 1]) moved++;
    n++;
  }
  return n > 0 ? moved / n : ACTIVITY_REF;
}

function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const scale = SIGMA * ((activity(m.prices) + ACTIVITY_FLOOR) / ACTIVITY_REF);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const row = Z.map((z) => price6(x + z * scale * Math.sqrt(h)));
    for (let j = 1; j < 5; j++) if ((row[j] as number) < (row[j - 1] as number)) row[j] = row[j - 1] as number;
    rows.push(row);
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
