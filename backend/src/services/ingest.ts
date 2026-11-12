import { z } from 'zod';
import { CHUNK_STRATEGIES } from '../config.js';
import { pool, toVector } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { chunkText } from './chunk.js';
import { embed } from './models.js';
import { detectType, parseFile } from './parse.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

/** Required metadata — documents without it are rejected and never indexed. */
export const documentMetaSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required'),
    doc_key: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,64}$/, 'doc_key must be lowercase letters, digits or "-" (e.g. remote-work)'),
    version: z.coerce.number().int().positive(),
    valid_from: isoDate,
    valid_to: isoDate.optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((m) => !m.valid_to || m.valid_to >= m.valid_from, {
    message: 'valid_to must be on or after valid_from',
    path: ['valid_to'],
  });
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

export async function ingestDocument(
  tenantId: string,
  meta: DocumentMeta,
  file: { originalname: string; buffer: Buffer },
) {
  const { mime } = detectType(file.originalname);

  const dup = await pool.query(
    'SELECT id FROM documents WHERE tenant_id = $1 AND doc_key = $2 AND version = $3',
    [tenantId, meta.doc_key, meta.version],
  );
  if (dup.rowCount) {
    throw new HttpError(409, `${meta.doc_key} v${meta.version} already exists for tenant ${tenantId}`);
  }

  // 1. Parse
  const text = await parseFile(file.originalname, file.buffer);

  // 2. Chunk (both strategies) + 3. Embed — done before opening the transaction.
  const prepared = [];
  for (const strategy of CHUNK_STRATEGIES) {
    const pieces = await chunkText(text, strategy);
    const vectors = await embed(pieces);
    prepared.push({ strategy, pieces, vectors });
  }

  // 4. Index (one transaction: document + chunks + expire older versions)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO documents (tenant_id, doc_key, title, version, valid_from, valid_to, file_name, mime_type, char_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, meta.doc_key, meta.title, meta.version, meta.valid_from, meta.valid_to ?? null,
       file.originalname, mime, text.length],
    );
    const doc = rows[0];

    for (const { strategy, pieces, vectors } of prepared) {
      for (let i = 0; i < pieces.length; i++) {
        await client.query(
          `INSERT INTO chunks (document_id, strategy, chunk_index, content, char_count, embedding)
           VALUES ($1,$2,$3,$4,$5,$6::vector)`,
          [doc.id, strategy, i, pieces[i], pieces[i].length, toVector(vectors[i])],
        );
      }
    }

    // Versioning: only the highest version of a doc_key stays 'active'.
    const expired = await client.query(
      `UPDATE documents SET status = 'expired'
       WHERE tenant_id = $1 AND doc_key = $2 AND status = 'active'
         AND version < (SELECT max(version) FROM documents WHERE tenant_id = $1 AND doc_key = $2)
       RETURNING id, version`,
      [tenantId, meta.doc_key],
    );
    await client.query('COMMIT');

    const { rows: [fresh] } = await pool.query('SELECT * FROM documents WHERE id = $1', [doc.id]);
    return {
      document: fresh,
      chunk_counts: Object.fromEntries(prepared.map((p) => [p.strategy, p.pieces.length])),
      expired_versions: expired.rows,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
