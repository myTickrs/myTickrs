import type { Ctx } from '../context.js';
import type { IsoDate } from '../model.js';
import { buildFxResolver } from './fx-resolver.js';

export async function getFxRate(ctx: Ctx, from: string, to: string, date: IsoDate) {
  const data = ctx.data;
  const resolve = buildFxResolver(await data.fx.listRates());
  const rate = resolve(from, to, date);
  return { from, to, date, rate, source: rate ? ('CACHE' as const) : null };
}
