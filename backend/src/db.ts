import pg from 'pg';
import { config } from './config.js';

// DATE columns come back as 'YYYY-MM-DD' strings instead of JS Date (avoids timezone shifts).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** pgvector literal: '[0.1,0.2,...]' — used with a `::vector` cast in SQL. */
export const toVector = (v: number[]): string => `[${v.join(',')}]`;

const schema = (dim: number) => `
CREATE EXTENSION IF NOT EXISTS vector;

-- One row = one uploaded file = one version of a policy.
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  doc_key     TEXT NOT NULL,          -- groups versions of the same policy, e.g. 'remote-work'
  title       TEXT NOT NULL,
  version     INT  NOT NULL CHECK (version > 0),
  valid_from  DATE NOT NULL,
  valid_to    DATE,                   -- NULL = open-ended
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  char_count  INT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (tenant_id, doc_key, version)
);
CREATE INDEX IF NOT EXISTS documents_tenant_status_idx ON documents (tenant_id, status);

-- Every document is chunked with BOTH strategies so they can be compared on the same data.
CREATE TABLE IF NOT EXISTS chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  strategy     TEXT NOT NULL CHECK (strategy IN ('semantic', 'structure')),
  chunk_index  INT  NOT NULL,
  content      TEXT NOT NULL,
  char_count   INT  NOT NULL,
  embedding    vector(${dim}) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, strategy, chunk_index)
);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id, strategy);
-- NOTE: deliberately no HNSW/IVFFlat index. With an approximate index, pgvector applies the
-- WHERE filter AFTER the index scan, so a filtered top-k can silently return < k rows.
-- At this data size an exact scan is fast and guarantees "filter before top-k".

CREATE TABLE IF NOT EXISTS query_logs (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  endpoint             TEXT NOT NULL CHECK (endpoint IN ('search', 'ask')),
  question             TEXT NOT NULL,
  document_ids         UUID[],
  strategy             TEXT NOT NULL,
  top_k                INT  NOT NULL,
  retrieved_chunk_ids  BIGINT[] NOT NULL DEFAULT '{}',
  scores               REAL[]   NOT NULL DEFAULT '{}',
  status               TEXT,              -- ask: 'answered' | 'insufficient'
  answer               TEXT,
  citations            JSONB,
  raw_llm_output       TEXT,              -- before citation validation, for debugging
  latency_ms           INT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS query_logs_tenant_created_idx ON query_logs (tenant_id, created_at DESC);
`;

export async function initDb(): Promise<void> {
  await pool.query(schema(config.embedDim));
  const { rows } = await pool.query<{ typmod: number }>(
    `SELECT atttypmod AS typmod FROM pg_attribute
     WHERE attrelid = 'chunks'::regclass AND attname = 'embedding'`,
  );
  if (rows[0] && rows[0].typmod !== config.embedDim) {
    throw new Error(
      `chunks.embedding is vector(${rows[0].typmod}) but EMBED_DIM=${config.embedDim}. ` +
        `Drop the chunks table (or the DB volume) after changing the embedding model.`,
    );
  }
}
