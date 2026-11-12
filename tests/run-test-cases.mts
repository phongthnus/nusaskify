/**
 * Runs TC1–TC8 against the live API and writes tests/results/test-results.md
 * (raw evidence for the README report). Automatic checks are marked PASS/FAIL;
 * TC2/TC7/TC8 also need your written explanation.
 * Prereq: backend running + `npm run seed`.   Run (from backend/): npm run test-cases
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:3000';
const STRATEGY = (process.env.STRATEGY ?? 'semantic') as 'semantic' | 'structure';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'results');

// ---- questions: edit freely --------------------------------------------------------------
const Q = {
  paraphrase: 'How many days a week am I allowed to work from home?', // doc says "remote work"
  uncovered: 'What is the company policy on bringing pets to the office?',
  otherDoc: 'What is the maximum hotel cost per night on a business trip?',
  failureMode: 'How many days of unpaid leave can I take per year?', // paid vs. unpaid wording
};

interface Doc { id: string; doc_key: string; version: number; is_current: boolean; title: string }
interface Chunk { chunk_id: number; document_id: string; doc_key: string; title: string; version: number; chunk_index: number; content: string; score: number }
interface Ask { status: string; answer: string; reason?: string; citations: { marker: number; chunk_id: number }[]; chunks: Chunk[] }

const call = async <T,>(tenant: string, p: string, body?: unknown): Promise<T> => {
  const res = await fetch(`${API}${p}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Tenant-Id': tenant, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${p}: ${json.error}`);
  return json as T;
};
const ask = (t: string, question: string, document_ids?: string[], top_k = 5) =>
  call<Ask>(t, '/api/ask', { question, document_ids, top_k, strategy: STRATEGY });
const search = (t: string, question: string, document_ids?: string[], top_k = 3) =>
  call<{ chunks: Chunk[] }>(t, '/api/search', { question, document_ids, top_k, strategy: STRATEGY });

let md = `# Test results (${new Date().toISOString()}, strategy=${STRATEGY})\n\n`;
const summary: string[] = [];
const verdict = (tc: string, ok: boolean, note: string) => {
  summary.push(`| ${tc} | ${ok ? '✅ PASS' : '❌ FAIL'} | ${note} |`);
  md += `**${ok ? 'PASS' : 'FAIL'}** — ${note}\n\n`;
};
const chunkTable = (cs: Chunk[]) =>
  '| # | doc | v | chunk | score | content |\n|---|---|---|---|---|---|\n' +
  cs.map((c, i) => `| ${i + 1} | ${c.doc_key} | ${c.version} | ${c.chunk_index} | ${c.score.toFixed(4)} | ${c.content.replace(/\s+/g, ' ').slice(0, 140)}… |`).join('\n') + '\n\n';
const answerBlock = (a: Ask) =>
  `- status: \`${a.status}\`${a.reason ? ` (${a.reason})` : ''}\n- answer: ${a.answer.replace(/\n/g, ' ')}\n- citations: ${a.citations.map((c) => `[${c.marker}]→chunk ${c.chunk_id}`).join(', ') || '—'}\n\n` + chunkTable(a.chunks);

const acme = await call<Doc[]>('acme', '/api/documents');
const globex = await call<Doc[]>('globex', '/api/documents');
const find = (docs: Doc[], key: string, v?: number) => docs.find((d) => d.doc_key === key && (v === undefined || d.version === v));
const rwV1 = find(acme, 'remote-work', 1), rwV2 = find(acme, 'remote-work', 2);
const leave = find(acme, 'annual-leave'), travel = find(acme, 'travel-expense');
if (!rwV1 || !rwV2 || !leave || !travel || !find(globex, 'remote-work')) {
  throw new Error('Sample docs missing — run `npm run seed` first.');
}
const acmeAll = acme.map((d) => d.id); // includes the expired v1 on purpose

// TC1 ---------------------------------------------------------------------------------------
md += `## TC1 — paraphrased question\nQ: "${Q.paraphrase}" (document wording: "remote work")\n\n`;
const tc1 = await ask('acme', Q.paraphrase, acmeAll);
md += answerBlock(tc1);
const tc1CitedV2 = tc1.citations.some((c) => tc1.chunks.find((k) => k.chunk_id === c.chunk_id)?.document_id === rwV2.id);
verdict('TC1', tc1.status === 'answered' && tc1CitedV2, 'answered and cites remote-work v2 (check the answer says 3 days)');

// TC2 ---------------------------------------------------------------------------------------
md += `## TC2 — /api/search top 3 for the TC1 question\n\n`;
const tc2 = await search('acme', Q.paraphrase, acmeAll, 3);
md += chunkTable(tc2.chunks);
verdict('TC2', tc2.chunks[0]?.doc_key === 'remote-work', 'top-1 chunk is from remote-work → explain why (embeddings encode meaning, WFH ≈ remote work)');

// TC3 ---------------------------------------------------------------------------------------
md += `## TC3 — question not covered\nQ: "${Q.uncovered}"\n\n`;
const tc3 = await ask('acme', Q.uncovered, acmeAll);
md += answerBlock(tc3);
verdict('TC3', tc3.status === 'insufficient', 'returns insufficient / "not enough information"');

// TC4 ---------------------------------------------------------------------------------------
md += `## TC4 — expired v1 and current v2 both selected\n\n`;
const tc4 = await ask('acme', Q.paraphrase, [rwV1.id, rwV2.id]);
md += answerBlock(tc4);
verdict('TC4', tc4.chunks.length > 0 && tc4.chunks.every((c) => c.version === 2), 'no chunk from expired v1 even though it was selected');

// TC5 ---------------------------------------------------------------------------------------
md += `## TC5 — switch tenant to globex\n\n### 5a. Same question as globex (all its docs)\n\n`;
const tc5a = await ask('globex', Q.paraphrase);
md += answerBlock(tc5a);
const globexIds = new Set(globex.map((d) => d.id));
md += `### 5b. globex sends ACME document ids (tenant spoofing attempt)\n\n`;
const tc5b = await search('globex', Q.paraphrase, acmeAll, 5);
md += chunkTable(tc5b.chunks);
verdict('TC5', tc5a.status === 'answered' && tc5a.chunks.every((c) => globexIds.has(c.document_id)) && tc5b.chunks.length === 0,
  'globex answers from globex chunks only (5 days/week); ACME ids return 0 chunks');

// TC6 ---------------------------------------------------------------------------------------
md += `## TC6 — only annual-leave selected, question about travel\nQ: "${Q.otherDoc}"\n\n`;
const tc6 = await ask('acme', Q.otherDoc, [leave.id]);
md += answerBlock(tc6);
verdict('TC6', tc6.chunks.every((c) => c.document_id === leave.id), 'no chunk from travel-expense (status should be insufficient)');

// TC7 ---------------------------------------------------------------------------------------
md += `## TC7 — citations point to retrieved chunks\n\n`;
let tc7ok = true;
for (const [name, r] of [['TC1', tc1], ['TC4', tc4], ['TC5a', tc5a]] as const) {
  for (const c of r.citations) {
    const ch = r.chunks.find((k) => k.chunk_id === c.chunk_id);
    if (!ch) tc7ok = false;
    md += `- ${name} [${c.marker}] → chunk ${c.chunk_id} ${ch ? `(${ch.doc_key} v${ch.version})` : '**NOT RETRIEVED**'}: "${ch?.content.replace(/\s+/g, ' ').slice(0, 200)}…"\n`;
  }
}
md += `\n> Manually confirm each quoted chunk actually supports the sentence it is attached to.\n\n`;
verdict('TC7', tc7ok, 'every citation id ∈ retrieved chunks (support must be checked by reading)');

// TC8 ---------------------------------------------------------------------------------------
md += `## TC8 — similarity failure mode\nQ: "${Q.failureMode}" (doc has paid leave AND unpaid leave in similar wording)\n\n`;
const tc8 = await search('acme', Q.failureMode, [leave.id], 3);
md += chunkTable(tc8.chunks);
md += `### /api/ask with the same question\n\n` + answerBlock(await ask('acme', Q.failureMode, [leave.id]));
const top = tc8.chunks[0];
const failed = top && !/unpaid/i.test(top.content);
md += failed
  ? `> Reproduced: the most similar chunk does not contain "unpaid". Explain why (shared vocabulary "days … leave … per year" dominates the vector; negation/modifiers like "un-" barely move it).\n\n`
  : `> Top-1 already contains the unpaid-leave rule with this chunking. Try another pair (e.g. paid vs. sick leave, domestic vs. international per diem, structure strategy, or a smaller chunk size) to show a case where the most similar chunk is wrong.\n\n`;
summary.push(`| TC8 | ${failed ? '🔎 reproduced' : '⚠️ not reproduced'} | most similar chunk ${failed ? 'is NOT' : 'is'} the unpaid-leave rule — analyse |`);

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `test-results-${STRATEGY}.md`);
fs.writeFileSync(file, `${md}\n## Summary\n\n| TC | Result | Check |\n|---|---|---|\n${summary.join('\n')}\n`);
console.log(summary.join('\n'));
console.log(`\nFull evidence → ${path.relative(process.cwd(), file)}`);
