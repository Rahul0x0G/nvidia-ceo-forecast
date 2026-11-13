// Tuning sweep on the practice cases (p00..p04 scored against the next case's prices). Usage: node tools/tune.mjs <inputDir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const inDir = process.argv[2];
const TAUS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
const ids = ['p00', 'p01', 'p02', 'p03', 'p04', 'p05'];
const cases = ids.map((id) => JSON.parse(readFileSync(join(inDir, `${id}.in`), 'utf8')));

const clamp = (x) => Math.min(1, Math.max(0, x));

// Variant: q = x + z * s * h^a, where s is the baseline constant times a per-market scale from a robust (median-abs) move size.
function makeForecaster({ s, a, robust, rk }) {
  return (prices, h) => {
    const x = prices[prices.length - 1];
    let scale = s;
    if (robust) {
      // Share of minutes in the last 24h in which the price moved, as a gentle multiplier on the spread.
      const lo = Math.max(1, prices.length - 1440);
      let moved = 0, n = 0;
      for (let i = lo; i < prices.length; i++) { if (prices[i] !== prices[i - 1]) moved++; n++; }
      const frac = n > 0 ? moved / n : 0.2;
      scale = s * Math.pow((frac + 0.02) / 0.2, rk);
    }
    return Z.map((z) => clamp(x + z * scale * Math.pow(h, a)));
  };
}

function score(f) {
  let sum = 0, n = 0, cov = 0, mins = 0;
  for (let k = 0; k < 5; k++) {
    const next = cases[k + 1];
    const nextById = new Map(next.markets.map((m) => [m.id, m]));
    const atMs = Date.parse(cases[k].at);
    for (const m of cases[k].markets) {
      const nm = nextById.get(m.id);
      if (!nm) continue;
      const startMs = Date.parse(nm.start);
      for (let h = 1; h <= 240; h++) {
        const y = nm.prices[(atMs + h * 60000 - startMs) / 60000];
        if (y === undefined) continue;
        const q = f(m.prices, h);
        for (let j = 0; j < 5; j++) {
          const e = y - q[j];
          sum += 100 * Math.max(TAUS[j] * e, (TAUS[j] - 1) * e);
          n++;
        }
        if (q[0] <= y && y <= q[4]) cov++;
        mins++;
      }
    }
  }
  return { loss: sum / n, cov: cov / mins };
}

const rows = [];
for (const a of [0.5, 0.4, 0.3]) {
  for (const s of [0.0005, 0.001, 0.0015, 0.0025]) {
    for (const [robust, rk] of [[false, 0], [true, 0.5], [true, 1]]) {
      const r = score(makeForecaster({ s, a, robust, rk }));
      rows.push({ a, s, robust, rk, ...r });
    }
  }
}
rows.sort((x, y) => x.loss - y.loss);
for (const r of rows.slice(0, 12)) console.log(`a=${r.a} s=${r.s} robust=${r.robust} rk=${r.rk}  loss=${r.loss.toFixed(6)} cov=${r.cov.toFixed(4)}`);
const base = score(makeForecaster({ s: 0.0025, a: 0.5, robust: false, rk: 0 }));
console.log(`baseline-shape check: loss=${base.loss.toFixed(6)} cov=${base.cov.toFixed(4)}`);
