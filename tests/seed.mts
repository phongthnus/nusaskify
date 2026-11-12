/**
 * Uploads the sample policy set through the real API (POST /api/documents).
 * Prereq: backend running, `npm run sample-docs` done.   Run (from backend/): npm run seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:3000';
const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sample_docs');

export const SEED = [
  { tenant: 'acme', file: 'acme_remote-work_v1_2024.pdf', title: 'Remote Work Policy', doc_key: 'remote-work', version: 1, valid_from: '2024-01-01', valid_to: '2025-12-31' },
  { tenant: 'acme', file: 'acme_remote-work_v2_2026.docx', title: 'Remote Work Policy', doc_key: 'remote-work', version: 2, valid_from: '2026-01-01' },
  { tenant: 'acme', file: 'acme_annual-leave_v1_2026.docx', title: 'Annual Leave Policy', doc_key: 'annual-leave', version: 1, valid_from: '2026-01-01' },
  { tenant: 'acme', file: 'acme_travel-expense_v1_2026.pdf', title: 'Travel Expense Policy', doc_key: 'travel-expense', version: 1, valid_from: '2026-01-01' },
  { tenant: 'globex', file: 'globex_remote-work_v1_2026.docx', title: 'Globex Remote Work Policy', doc_key: 'remote-work', version: 1, valid_from: '2026-01-01' },
  { tenant: 'globex', file: 'globex_travel-expense_v1_2026.odt', title: 'Globex Travel Expense Policy', doc_key: 'travel-expense', version: 1, valid_from: '2026-01-01' },
];

for (const d of SEED) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(path.join(docsDir, d.file))]), d.file);
  for (const k of ['title', 'doc_key', 'version', 'valid_from', 'valid_to'] as const) {
    if (d[k as keyof typeof d] !== undefined) form.append(k, String(d[k as keyof typeof d]));
  }
  const res = await fetch(`${API}/api/documents`, { method: 'POST', headers: { 'X-Tenant-Id': d.tenant }, body: form });
  const body = await res.json();
  if (res.status === 409) console.log(`skip  ${d.tenant}/${d.file} (already uploaded)`);
  else if (!res.ok) console.log(`FAIL  ${d.tenant}/${d.file}: ${body.error}`);
  else console.log(`ok    ${d.tenant}/${d.file} -> chunks ${JSON.stringify(body.chunk_counts)}`);
}
