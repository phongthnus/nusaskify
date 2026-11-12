import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { initDb } from './db.js';
import { errorHandler } from './lib/errors.js';
import { requireTenant } from './middleware/tenant.js';
import { documentsRouter } from './routes/documents.js';
import { qaRouter } from './routes/qa.js';
import { openapiSpec } from './swagger.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use('/api', requireTenant);
app.use('/api/documents', documentsRouter);
app.use('/api', qaRouter);

app.use(errorHandler);

await initDb();
app.listen(config.port, () => {
  console.log(`NUSAskify API  → http://localhost:${config.port}`);
  console.log(`Swagger UI     → http://localhost:${config.port}/api-docs`);
  console.log(`Models: embed=${config.embedModel} (dim ${config.embedDim}), chat=${config.chatModel}`);
});
