import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import type { ZodType } from 'zod';
import type { Ctx } from './context.js';
import { AppError } from './errors.js';

export type CtxOf = (req: ExpressRequest) => Ctx;

export function queryText(req: ExpressRequest, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

export function parse<T>(schema: ZodType<T>, value: unknown, what = 'request'): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', 422, `Invalid ${what}`, {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

export function isConfirmed(req: ExpressRequest): boolean {
  return req.query.confirm === 'true' || req.body?.confirm === true;
}

export type Handler = (req: ExpressRequest, res: Response, next: NextFunction) => Promise<void> | void;
