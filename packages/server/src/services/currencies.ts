import { DEFAULT_CURRENCIES, type CurrencyInput } from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { CurrencyRow, StoreTx } from '../store/ports.js';
import { buildFxResolver } from './fx-resolver.js';

const names = new Intl.DisplayNames(['en'], { type: 'currency' });

export function currencyName(code: string): string {
  return names.of(code) ?? code;
}

export async function loadCurrencies(data: StoreTx): Promise<CurrencyRow[]> {
  const rows = await data.currencies.list();
  if (rows.length > 0) return rows;
  const [user, usage] = await Promise.all([data.users.require(), data.currencies.usage()]);
  const codes = new Set<string>([...DEFAULT_CURRENCIES, user.baseCurrency, ...usage.map((u) => u.code)]);
  await data.currencies.add([...codes].map((code) => ({ code, name: currencyName(code) })));
  return data.currencies.list();
}

export async function ensureCurrency(data: StoreTx, code: string): Promise<void> {
  const rows = await loadCurrencies(data);
  if (!rows.some((r) => r.code === code)) await data.currencies.add([{ code, name: currencyName(code) }]);
}

export async function requireCurrency(data: StoreTx, code: string): Promise<void> {
  const rows = await loadCurrencies(data);
  if (!rows.some((r) => r.code === code)) {
    throw new AppError(
      'UNKNOWN_CURRENCY',
      422,
      `${code} is not one of your currencies. Add it in Settings → Currencies first.`,
      { currency: code },
    );
  }
}

export async function listCurrencies(ctx: Ctx) {
  const data = ctx.data;
  const rows = await loadCurrencies(data);
  const [user, usage, rates] = await Promise.all([
    data.users.require(),
    data.currencies.usage(),
    data.fx.listRates(),
  ]);
  const fx = buildFxResolver(rates);
  const today = ctx.clock.today();
  return {
    baseCurrency: user.baseCurrency,
    items: rows.map((r) => {
      const used = usage.find((u) => u.code === r.code);
      return {
        code: r.code,
        name: r.name,
        isBase: r.code === user.baseCurrency,
        accounts: used?.accounts ?? 0,
        transactions: used?.transactions ?? 0,
        rateToBase: fx(r.code, user.baseCurrency, today),
      };
    }),
  };
}

export async function addCurrency(ctx: Ctx, input: CurrencyInput) {
  return ctx.store.transaction(ctx.principal, async (tx) => {
    const rows = await loadCurrencies(tx);
    if (rows.some((r) => r.code === input.code)) {
      throw new AppError('CURRENCY_EXISTS', 409, `${input.code} is already one of your currencies`);
    }
    const row = { code: input.code, name: input.name ?? currencyName(input.code) };
    await tx.currencies.add([row]);
    return row;
  });
}

export async function deleteCurrency(ctx: Ctx, code: string) {
  await ctx.store.transaction(ctx.principal, async (tx) => {
    const rows = await loadCurrencies(tx);
    if (!rows.some((r) => r.code === code)) throw new AppError('NOT_FOUND', 404, 'No such currency');
    const user = await tx.users.require();
    if (user.baseCurrency === code) {
      throw new AppError(
        'CURRENCY_IN_USE',
        409,
        `${code} is your base currency. Choose another base currency first.`,
      );
    }
    const used = (await tx.currencies.usage()).find((u) => u.code === code);
    if (used && (used.accounts > 0 || used.transactions > 0)) {
      throw new AppError(
        'CURRENCY_IN_USE',
        409,
        `${code} is still used by ${used.accounts} account(s) and ${used.transactions} transaction(s)`,
        used,
      );
    }
    await tx.currencies.delete(code);
  });
}
