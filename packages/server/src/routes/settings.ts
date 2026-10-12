import { FEE_PRESETS } from '@tickrs/core';
import {
  accountBatchSchema,
  accountPatchSchema,
  accountSchema,
  currencyCode,
  currencySchema,
  feeQuoteSchema,
  feeScheduleSchema,
  settingsSchema,
  type AccountDto,
  type UserSettings,
} from '@tickrs/shared';
import type { Router } from 'express';
import { AppError } from '../errors.js';
import { type CtxOf, isConfirmed, parse } from '../http.js';
import { createAccount, createAccounts, updateAccount } from '../services/accounts.js';
import { addCurrency, deleteCurrency, listCurrencies, requireCurrency } from '../services/currencies.js';
import { quoteFee } from '../services/fees.js';
import type { UserRow } from '../store/ports.js';

function settingsOf(user: UserRow): UserSettings {
  return {
    baseCurrency: user.baseCurrency,
    averagePriceScope: user.averagePriceScope,
    optionPremiumTreatment: user.optionPremiumTreatment,
    autoExpireOtm: user.autoExpireOtm === 1,
    shortBuyHandling: user.shortBuyHandling,
    borrowFeeTreatment: user.borrowFeeTreatment,
    optionDataSource: user.optionDataSource,
  };
}

export function settingsRoutes(api: Router, ctxOf: CtxOf): void {
  api.get('/settings', async (req, res) => {
    res.json(settingsOf(await ctxOf(req).data.users.require()));
  });

  api.patch('/settings', async (req, res) => {
    const input = parse(settingsSchema, req.body);
    const { data } = ctxOf(req);
    const user = await data.users.require();
    if (input.baseCurrency) await requireCurrency(data, input.baseCurrency);
    await data.users.updateSettings({
      baseCurrency: input.baseCurrency,
      averagePriceScope: input.averagePriceScope,
      optionPremiumTreatment: input.optionPremiumTreatment,
      autoExpireOtm: input.autoExpireOtm === undefined ? undefined : input.autoExpireOtm ? 1 : 0,
      shortBuyHandling: input.shortBuyHandling,
      borrowFeeTreatment: input.borrowFeeTreatment,
    });
    if (input.baseCurrency && input.baseCurrency !== user.baseCurrency) {
      await data.snapshots.invalidateUser();
    }
    res.json(settingsOf(await data.users.require()));
  });

  api.get('/currencies', async (req, res) => {
    res.json(await listCurrencies(ctxOf(req)));
  });

  api.post('/currencies', async (req, res) => {
    res.status(201).json(await addCurrency(ctxOf(req), parse(currencySchema, req.body)));
  });

  api.delete('/currencies/:code', async (req, res) => {
    await deleteCurrency(ctxOf(req), parse(currencyCode, req.params.code, 'params'));
    res.status(204).end();
  });

  api.get('/accounts', async (req, res) => {
    const items: AccountDto[] = await ctxOf(req).data.accounts.list();
    res.json({ items });
  });

  api.post('/accounts', async (req, res) => {
    const account = await createAccount(ctxOf(req), parse(accountSchema, req.body));
    res.status(201).json(account);
  });

  api.post('/accounts/batch', async (req, res) => {
    const { items } = parse(accountBatchSchema, req.body);
    res.status(201).json({ items: await createAccounts(ctxOf(req), items) });
  });

  api.patch('/accounts/:id', async (req, res) => {
    const input = parse(accountPatchSchema, req.body);
    res.json(await updateAccount(ctxOf(req), req.params.id, input));
  });

  api.delete('/accounts/:id', async (req, res) => {
    if (!isConfirmed(req)) {
      throw new AppError('CONFIRMATION_REQUIRED', 409, 'Deleting an account removes all of its transactions');
    }
    await ctxOf(req).data.accounts.delete(req.params.id);
    res.status(204).end();
  });

  api.get('/fee-presets', (_req, res) => {
    res.json({
      items: Object.entries(FEE_PRESETS).map(([key, preset]) => ({
        key,
        name: preset.name,
        schedule: preset.schedule,
      })),
    });
  });

  api.get('/accounts/:id/fee-schedule', async (req, res) => {
    const { data } = ctxOf(req);
    const account = await data.accounts.require(req.params.id);
    res.json((await data.feeSchedules.find(account.feeScheduleId)) ?? null);
  });

  api.put('/accounts/:id/fee-schedule', async (req, res) => {
    const { data } = ctxOf(req);
    await data.accounts.require(req.params.id);
    const input = parse(feeScheduleSchema, req.body);
    res.json(await data.feeSchedules.saveForAccount(req.params.id, input));
  });

  api.post('/fees/quote', async (req, res) => {
    res.json(await quoteFee(ctxOf(req), parse(feeQuoteSchema, req.body)));
  });
}
