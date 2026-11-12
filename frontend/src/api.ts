export const TENANTS = ['acme', 'globex'] as const;
export type Strategy = 'semantic' | 'structure';

export interface DocumentRow {
  id: string;
  tenant_id: string;
  doc_key: string;
  title: string;
  version: number;
  valid_from: string;
  valid_to: string | null;
  status: 'active' | 'expired';
  is_current: boolean;
  file_name: string;
  semantic_chunks: number;
  structure_chunks: number;
}

export interface RetrievedChunk {
  chunk_id: number;
  document_id: string;
  doc_key: string;
  title: string;
  version: number;
  chunk_index: number;
  content: string;
  score: number;
}

export interface Citation {
  marker: number;
  chunk_id: number;
  document_id: string;
  title: string;
  version: number;
  chunk_index: number;
}

export interface AskResponse {
  log_id: number | null;
  status: 'answered' | 'insufficient';
  answer: string;
  reason?: string;
  citations: Citation[];
  chunks: RetrievedChunk[];
}

export interface ChunkRow {
  id: number;
  chunk_index: number;
  strategy: Strategy;
  char_count: number;
  content: string;
}

async function request<T>(tenant: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'X-Tenant-Id': tenant, ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(body.details)
      ? ' — ' + body.details.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join('; ')
      : '';
    throw new Error((body.error ?? `HTTP ${res.status}`) + details);
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listDocuments: (t: string) => request<DocumentRow[]>(t, '/api/documents'),
  uploadDocument: (t: string, form: FormData) =>
    request<{ document: DocumentRow; chunk_counts: Record<Strategy, number>; expired_versions: unknown[] }>(
      t, '/api/documents', { method: 'POST', body: form }),
  deleteDocument: (t: string, id: string) => request<void>(t, `/api/documents/${id}`, { method: 'DELETE' }),
  chunks: (t: string, id: string, strategy: Strategy) =>
    request<ChunkRow[]>(t, `/api/documents/${id}/chunks?strategy=${strategy}`),
  search: (t: string, body: { question: string; document_ids?: string[]; top_k: number; strategy: Strategy }) =>
    request<{ log_id: number | null; chunks: RetrievedChunk[] }>(t, '/api/search', json(body)),
  ask: (t: string, body: { question: string; document_ids?: string[]; top_k: number; strategy: Strategy }) =>
    request<AskResponse>(t, '/api/ask', json(body)),
};
