#!/usr/bin/env node
// Diff-scoped enforcement of the CONSTRAINTS.md floor. Adapted from the constraint-driven-development
// reference (test-related checks dropped: this project has no automated tests by decision).
// Usage: node scripts/floor-guard.mjs [--base <ref>]   (default base: main)
// Exit: 0 clean, 1 floor violation, 2 the guard could not run.
import { execFileSync } from 'node:child_process';

const base = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'main';
})();

// `git diff --no-index` exits 1 whenever the sides differ (normal for a new file), so keep that output.
// Any other failure is null, and null never reads as clean.
const git = (args, { diffExit = false } = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null;
  }
};
const bail = (msg) => {
  console.error('floor-guard: ' + msg);
  process.exit(2);
};

const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);

const mergeBase = git(['merge-base', base, 'HEAD'])?.trim();
if (!mergeBase) bail('no merge base against ' + base);

const tracked = git(['diff', '--unified=0', mergeBase, '--']);
if (tracked === null) bail('could not diff against ' + mergeBase);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
if (untrackedFiles === null) bail('could not list untracked files');
const untracked = untrackedFiles
  .split('\n')
  .filter(Boolean)
  .map((f) => {
    const d = git(['diff', '--no-index', '--unified=0', '/dev/null', f], { diffExit: true });
    if (d === null) bail('could not diff untracked file ' + f);
    return d;
  })
  .join('\n');
const diff = tracked + '\n' + untracked;

// `---`/`+++` are headers only between a file's `diff` line and its first `@@`.
const added = [];
const removed = [];
const pathOf = (s) => s.replace(/^[ab]\//, '');
let file = '';
let oldFile = '';
let inHeader = false;
for (const line of diff.split('\n')) {
  if (line.startsWith('diff ')) inHeader = true;
  else if (line.startsWith('@@')) inHeader = false;
  else if (inHeader) {
    if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4));
    else if (line.startsWith('+++ ')) {
      const newFile = pathOf(line.slice(4));
      file = newFile === '/dev/null' ? oldFile : newFile;
    }
  } else if (line.startsWith('+')) added.push({ file, text: line.slice(1) });
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1) });
}

const findings = [];
const flag = (rule, f, text) => findings.push({ rule, file: f, text: text.trim().slice(0, 120) });
const isConstraints = (f) => /(^|\/)CONSTRAINTS\.md$/.test(f);
const isSource = (f) => /^src\/.*\.(ts|tsx|js|jsx|mjs)$/.test(f);
const isCode = (f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f);
const isGuard = (f) => f === 'scripts/floor-guard.mjs'; // its own patterns would flag themselves

// Silenced checker.
const SUPPRESSIONS = /@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable/;
// Unfinished work.
const STUBS = /throw new (Error|NotImplemented).*[Nn]ot implemented|catch\s*\(\w*\)\s*\{\s*\}|catch\s*\{\s*\}|\bTODO\b/;
// Runtime network calls (PLAN.md: no network at runtime).
const NETWORK = /\bfetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|import\(\s*['"`]https?:|from\s+['"`]https?:/;

for (const { file: f, text } of added) {
  if (isGuard(f)) continue;
  if (isCode(f) && SUPPRESSIONS.test(text)) flag('silenced-checker', f, text);
  if (isCode(f) && STUBS.test(text)) flag('unfinished-work', f, text);
  if (isSource(f) && NETWORK.test(text)) flag('network-call', f, text);
  if (isConstraints(f) && /^\| *(W|E)\d+ *\|/.test(text)) flag('new-exception', f, text);
}

// Personal data: whole-repo check, not diff-scoped. Report paths only, never contents.
const dwgTracked = git(['ls-files', '--cached', '--', 'dwg', '*.dwg', '*.DWG', '*.dxf', '*.DXF']);
if (dwgTracked === null) bail('could not list tracked files');
for (const f of dwgTracked.split('\n').filter(Boolean)) flag('personal-data', f, 'tracked by git');

// A rule in CONSTRAINTS.md weakened or removed (reference logic, unchanged).
const ruleKey = (t) => {
  const s = t.trim();
  if (s.startsWith('|')) return s.split('|').map((c) => c.trim()).filter(Boolean)[0] ?? '';
  if (/^[-*] /.test(s)) return s.slice(2).split(':')[0].trim();
  return null;
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE = /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const MIN_AFTER = /^\s*\S*\s*(?:\|\s*)?(or more|or higher|must not fall|must not drop)/;
const MAX_AFTER = /^\s*\S*\s*(?:\|\s*)?(or less|or lower|must not grow|must not exceed)/;
const thresholds = (t) => {
  const out = [];
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    const dir =
      MIN_BEFORE.test(before) || MIN_AFTER.test(after)
        ? 'min'
        : MAX_BEFORE.test(before) || MAX_AFTER.test(after)
          ? 'max'
          : null;
    out.push({ n: Number(m[0]), dir });
  }
  return out;
};
const removedRules = removed.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
for (const r of removedRules) {
  const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
  if (!a) {
    if (!isException(r.text)) flag('rule-removed', r.file, r.text);
    continue;
  }
  const before = thresholds(r.text);
  const after = thresholds(a.text);
  let verdict = null;
  for (const dir of ['min', 'max', null]) {
    const was = before.filter((x) => x.dir === dir);
    const now = after.filter((x) => x.dir === dir);
    was.forEach((b, i) => {
      const n = now[i];
      if (verdict) return;
      if (!n) verdict = 'threshold-removed';
      else if (n.n === b.n) return;
      else if (dir === 'min' ? n.n < b.n : dir === 'max' ? n.n > b.n : true) {
        verdict = dir ? 'threshold-loosened' : 'threshold-changed';
      }
    });
  }
  if (verdict) flag(verdict, r.file, r.text + '  ->  ' + a.text);
}

if (findings.length === 0) {
  console.log('floor-guard: clean');
  process.exit(0);
}
console.error('floor-guard: ' + findings.length + ' floor violation(s):');
for (const f of findings) console.error(`  [${f.rule}] ${f.file}: ${f.text}`);
if (findings.some((f) => f.rule === 'rule-removed')) {
  console.error("\nrule-removed can also mean a rule's label changed: rename in one commit, change thresholds in another.");
}
if (findings.some((f) => f.rule === 'threshold-changed')) {
  console.error('\nthreshold-changed: a number without direction words changed (e.g. a "Today" column). Check it was intended.');
}
console.error('\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception.');
process.exit(1);
