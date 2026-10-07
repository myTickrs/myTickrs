import type { AccountInput } from '@tickrs/shared';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { Uuid } from '../model.js';
import { requireCurrency } from './currencies.js';

export async function createAccount(ctx: Ctx, input: AccountInput) {
  return ctx.store.transaction(ctx.principal, async (tx) => {
    await requireCurrency(tx, input.currency);
    return tx.accounts.create(input);
  });
}

export async function createAccounts(ctx: Ctx, inputs: AccountInput[]) {
  return ctx.store.transaction(ctx.principal, async (tx) => {
    for (const currency of new Set(inputs.map((a) => a.currency))) await requireCurrency(tx, currency);
    const created = [];
    for (const input of inputs) created.push(await tx.accounts.create(input));
    return created;
  });
}

export async function updateAccount(ctx: Ctx, id: Uuid, input: Partial<AccountInput>) {
  return ctx.store.transaction(ctx.principal, async (tx) => {
    const account = await tx.accounts.require(id, true);
    if (input.currency !== undefined && input.currency !== account.currency) {
      await requireCurrency(tx, input.currency);
      const rows = await tx.transactions.listForAccount(id);
      const held = rows.find((r) => r.assetClass === 'STOCK' && r.currency !== input.currency);
      if (held) {
        throw new AppError(
          'CURRENCY_IN_USE',
          409,
          `This account has ${held.symbol} trades in ${held.currency}, so its currency cannot become ${input.currency}`,
          { symbol: held.symbol, currency: held.currency },
        );
      }
    }
    return tx.accounts.update(id, input);
  });
}
