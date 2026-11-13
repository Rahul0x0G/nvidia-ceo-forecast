// Local backtest on the kit's practice cases: p00..p04 are scored against the prices that the following case holds
// (cases are 4 hours apart and the horizon is 240 minutes). Usage: node tools/backtest.mjs <inputDir> <outputDir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [inDir, outDir] = process.argv.slice(2);
const TAUS = [0.05, 0.25, 0.5, 0.75, 0.95];
const ids = ['p00', 'p01', 'p02', 'p03', 'p04', 'p05'];
const cases = ids.map((id) => JSON.parse(readFileSync(join(inDir, `${id}.in`), 'utf8')));
let sum = 0, n = 0, abs = 0, cov = 0, mins = 0;
for (let k = 0; k < 5; k++) {
  const out = JSON.parse(readFileSync(join(outDir, `${ids[k]}.out`), 'utf8'));
  const next = cases[k + 1];
  const nextById = new Map(next.markets.map((m) => [m.id, m]));
  for (const f of out.forecasts) {
    const m = nextById.get(f.id);
    if (!m) continue;
    const startMs = Date.parse(m.start);
    const atMs = Date.parse(cases[k].at);
    for (let h = 1; h <= 240; h++) {
      const idx = (atMs + h * 60000 - startMs) / 60000;
      const y = m.prices[idx];
      if (y === undefined) continue;
      const row = f.q[h - 1];
      for (let j = 0; j < 5; j++) {
        const e = y - row[j];
        sum += 100 * Math.max(TAUS[j] * e, (TAUS[j] - 1) * e);
        n++;
      }
      abs += 100 * Math.abs(y - row[2]);
      if (row[0] <= y && y <= row[4]) cov++;
      mins++;
    }
  }
}
console.log(`loss ${(sum / n).toFixed(6)}  median_err ${(abs / mins).toFixed(6)}  coverage90 ${(cov / mins).toFixed(4)}  items ${n}`);
