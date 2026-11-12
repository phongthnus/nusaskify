import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJSDoc from 'swagger-jsdoc';

const here = path.dirname(fileURLToPath(import.meta.url));

export const openapiSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'NUSAskify API',
      version: '0.1.0',
      description:
        'Internal policy Q&A (RAG). Every /api call needs the `X-Tenant-Id` header (try `acme` or `globex`).',
    },
    components: {
      parameters: {
        TenantHeader: {
          in: 'header',
          name: 'X-Tenant-Id',
          required: true,
          schema: { type: 'string', example: 'acme' },
        },
      },
      schemas: {
        RetrievedChunk: {
          type: 'object',
          properties: {
            chunk_id: { type: 'integer' },
            document_id: { type: 'string', format: 'uuid' },
            doc_key: { type: 'string' },
            title: { type: 'string' },
            version: { type: 'integer' },
            chunk_index: { type: 'integer' },
            content: { type: 'string' },
            score: { type: 'number', description: 'Cosine similarity (1 = identical)' },
          },
        },
      },
    },
  },
  apis: [path.join(here, 'routes/*.ts')],
});
