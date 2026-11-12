import type { RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId: string;
    }
  }
}

/** Simulated multi-tenancy: every /api request must carry X-Tenant-Id. */
export const requireTenant: RequestHandler = (req, _res, next) => {
  const tenant = req.header('X-Tenant-Id')?.trim();
  if (!tenant) return next(new HttpError(400, 'Missing X-Tenant-Id header'));
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenant)) {
    return next(new HttpError(400, 'Invalid X-Tenant-Id (allowed: letters, digits, _ and -)'));
  }
  req.tenantId = tenant;
  next();
};
