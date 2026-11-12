import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CHUNK_STRATEGIES, config } from '../config.js';
import { pool } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { documentMetaSchema, ingestDocument } from '../services/ingest.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
const idParam = z.object({ id: z.uuid('id must be a UUID') });

export const documentsRouter = Router();

/**
 * @openapi
 * /api/documents:
 *   post:
 *     tags: [Documents]
 *     summary: Upload a PDF/DOCX/ODT + metadata and run ingestion (parse → chunk → embed → index)
 *     description: |
 *       Chunks the document with BOTH strategies (semantic and structure). Uploading a higher
 *       `version` of the same `doc_key` marks older versions as `expired`.
 *       Documents missing required metadata are rejected (422) and not indexed.
 *     parameters: [{ $ref: '#/components/parameters/TenantHeader' }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, title, doc_key, version, valid_from]
 *             properties:
 *               file: { type: string, format: binary, description: '.pdf, .docx or .odt' }
 *               title: { type: string, example: Remote Work Policy }
 *               doc_key: { type: string, example: remote-work, description: Groups versions of one policy }
 *               version: { type: integer, example: 2 }
 *               valid_from: { type: string, format: date, example: '2026-01-01' }
 *               valid_to: { type: string, format: date, description: Optional, empty = open-ended }
 *     responses:
 *       201: { description: Ingested }
 *       400: { description: Missing tenant / file }
 *       409: { description: Same doc_key + version already exists }
 *       415: { description: Unsupported file type (only .pdf, .docx, .odt) }
 *       422: { description: Missing/invalid metadata or unreadable file }
 */
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Field "file" is required (multipart/form-data)');
  const meta = documentMetaSchema.parse(req.body ?? {});
  const result = await ingestDocument(req.tenantId, meta, req.file);
  res.status(201).json(result);
});

/**
 * @openapi
 * /api/documents:
 *   get:
 *     tags: [Documents]
 *     summary: List the tenant's documents (all versions)
 *     description: "`is_current` = status active AND today within [valid_from, valid_to]."
 *     parameters: [{ $ref: '#/components/parameters/TenantHeader' }]
 *     responses:
 *       200: { description: Documents of this tenant only }
 */
documentsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*,
            (d.status = 'active' AND d.valid_from <= CURRENT_DATE
              AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)) AS is_current,
            COUNT(c.id) FILTER (WHERE c.strategy = 'semantic')::int  AS semantic_chunks,
            COUNT(c.id) FILTER (WHERE c.strategy = 'structure')::int AS structure_chunks
     FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
     WHERE d.tenant_id = $1
     GROUP BY d.id
     ORDER BY d.doc_key, d.version DESC`,
    [req.tenantId],
  );
  res.json(rows);
});

/**
 * @openapi
 * /api/documents/{id}/chunks:
 *   get:
 *     tags: [Documents]
 *     summary: Show a document's chunks (debug)
 *     parameters:
 *       - $ref: '#/components/parameters/TenantHeader'
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: strategy, schema: { type: string, enum: [semantic, structure], default: semantic } }
 *     responses:
 *       200: { description: Chunks in order }
 *       404: { description: Not found for this tenant }
 */
documentsRouter.get('/:id/chunks', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const strategy = z.enum(CHUNK_STRATEGIES).default('semantic').parse(req.query.strategy);
  await assertOwned(id, req.tenantId);
  const { rows } = await pool.query(
    `SELECT id, chunk_index, strategy, char_count, content
     FROM chunks WHERE document_id = $1 AND strategy = $2 ORDER BY chunk_index`,
    [id, strategy],
  );
  res.json(rows.map((r) => ({ ...r, id: Number(r.id) })));
});

/**
 * @openapi
 * /api/documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete a document and its chunks
 *     parameters:
 *       - $ref: '#/components/parameters/TenantHeader'
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found for this tenant }
 */
documentsRouter.delete('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1 AND tenant_id = $2', [
    id,
    req.tenantId,
  ]);
  if (!rowCount) throw new HttpError(404, 'Document not found');
  res.status(204).end();
});

async function assertOwned(id: string, tenantId: string) {
  const { rowCount } = await pool.query('SELECT 1 FROM documents WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  // 404 (not 403) so other tenants can't probe which ids exist.
  if (!rowCount) throw new HttpError(404, 'Document not found');
}
