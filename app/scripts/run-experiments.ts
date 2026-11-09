/**
 * Runs the GraphCube Lab experiments and writes JSON + CSV to experiments/results.
 *
 *   npm run experiments                 # all experiments, full size
 *   npm run experiments -- --only E1,E2 # subset
 *   npm run experiments -- --quick      # reduced sizes (smoke test)
 *   npm run experiments -- --seed 42
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { EXPERIMENTS, toCSV, type ExperimentId } from '../src/experiments/protocols';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../experiments/results');
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const quick = args.includes('--quick');
const only = (arg('--only')?.split(',') ?? Object.keys(EXPERIMENTS)) as ExperimentId[];
const seedArg = arg('--seed');
let gitCommit: string | null = null;
try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: here }).toString().trim();
  const dirty = execSync('git status --porcelain', { cwd: here }).toString().trim();
  if (dirty) gitCommit += '+dirty';
} catch {
  gitCommit = null;
}
const environment = `node ${process.version}; ${os.type()} ${os.release()} ${os.arch()}; CPU ${os.cpus()[0]?.model ?? '?'} ×${os.cpus().length}; RAM ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB`;
mkdirSync(outDir, { recursive: true });

for (const id of only) {
  const exp = EXPERIMENTS[id];
  if (!exp) throw new Error(`experimento desconhecido: ${id}`);
  console.log(`▶ ${id} — ${exp.title}${quick ? ' (quick)' : ''}`);
  let lastLog = 0;
  const out = exp.run(
    { quick, gitCommit, environment, ...(seedArg ? { seed: seedArg } : {}) },
    (f, msg) => {
      const t = Date.now();
      if (t - lastLog > 3000) {
        console.log(`  ${(f * 100).toFixed(0).padStart(3)}%  ${msg}`);
        lastLog = t;
      }
    },
  );
  const base = resolve(outDir, `${id}${quick ? '-quick' : ''}`);
  writeFileSync(`${base}.json`, JSON.stringify(out, null, 1));
  writeFileSync(`${base}.csv`, toCSV(out.rows));
  console.log(`  ✓ ${out.rows.length} linhas em ${(out.meta.durationMs / 1000).toFixed(1)} s → ${base}.{json,csv}`);
}
