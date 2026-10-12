import { sql } from 'kysely';
import type { Principal } from '@tickrs/server/context.js';
import type { Db } from './db.js';
import type { Uuid } from '@tickrs/server/model.js';
import {
  accountIdsOf,
  createAccount,
  deleteAccount,
  findAccount,
  listAccounts,
  requireAccount,
  updateAccount,
} from './repositories/accounts.js';
import type { Executor } from './repositories/common.js';
import { readUserData, replaceUserData } from './repositories/backup.js';
import { findSyncBase, saveSyncBase } from './repositories/desktop.js';
import { findImportMapping, saveImportMapping } from './repositories/import-mappings.js';
import { addCurrencies, currencyUsage, deleteCurrency, listCurrencies } from './repositories/currencies.js';
import { findFeeSchedule, saveAccountFeeSchedule, toFeeSchedule } from './repositories/fee-schedules.js';
import { fxCoverage, listFxRates, upsertFxRates } from './repositories/fx.js';
import { createStrategyGroup, findStrategyGroup } from './repositories/strategy-groups.js';
import {
  deleteAdjustment,
  ensureContract,
  findContractByKey,
  findContractById,
  listAdjustments,
  loadContractMap,
  upsertAdjustment,
} from './repositories/option-contracts.js';
import {
  deleteManualMark,
  listDailyOptionQuotes,
  listLatestOptionQuotes,
  listManualMarks,
  listOptionQuoteTimes,
  upsertDailyOptionQuotes,
  addDailyOptionQuotes,
  upsertLatestOptionQuotes,
  upsertManualMark,
} from './repositories/option-quotes.js';
import {
  listDailyCloses,
  listLatestPrices,
  listQuoteTimes,
  listSymbolBars,
  listSymbolCloses,
  priceCoverage,
  upsertDailyPrices,
  upsertLatestPrices,
} from './repositories/prices.js';
import {
  deleteMarketKeys,
  deleteProviderKey,
  findProviderKey,
  listProviderKeys,
  saveProviderKey,
  setKeyStatus,
} from './repositories/provider-keys.js';
import { ensureSecurity, findSecurity, listSecurities, searchSecurities } from './repositories/securities.js';
import {
  invalidateAllSnapshots,
  invalidateSnapshotsFrom,
  invalidateUserSnapshots,
  listSnapshotsFrom,
  upsertSnapshots,
} from './repositories/snapshots.js';
import {
  deleteTransactions,
  findLinked,
  findTransaction,
  insertTransactions,
  listAccountTransactions,
  listLifecycleEvents,
  listUserTransactions,
  queryTransactions,
  referencedContractIds,
  updateTransaction,
} from './repositories/transactions.js';
import { hasDailyHeadroom, recordUsage, remainingBudget, usageToday } from './repositories/usage.js';
import { deleteMarket, listMarkets, saveMarket } from './repositories/markets.js';
import {
  listMarketProviders,
  replaceMarketProviders,
  resetMarketProviders,
} from './repositories/market-providers.js';
import { requireUser, updateUserSettings } from './repositories/users.js';
import type { Store, StoreTx } from '@tickrs/server/store/ports.js';

function makeTx(db: Executor, principal: Principal): StoreTx {
  const userId = principal.userId;
  return {
    accounts: {
      list: () => listAccounts(db, userId),
      find: (id) => findAccount(db, userId, id),
      require: (id, lock) => requireAccount(db, userId, id, lock),
      create: (input) => createAccount(db, userId, input as Parameters<typeof createAccount>[2]),
      update: (id, input) => updateAccount(db, userId, id, input as Parameters<typeof updateAccount>[3]),
      delete: (id) => deleteAccount(db, userId, id),
      ids: () => accountIdsOf(db, userId),
    },
    currencies: {
      list: () => listCurrencies(db, userId),
      add: (rows) => addCurrencies(db, userId, rows),
      delete: (code) => deleteCurrency(db, userId, code),
      usage: () => currencyUsage(db, userId),
    },
    transactions: {
      listForAccount: (accountId) => listAccountTransactions(db, accountId),
      listForUser: () => listUserTransactions(db, userId),
      find: (id) => findTransaction(db, userId, id),
      findLinked: (id) => findLinked(db, userId, id),
      query: (query) => queryTransactions(db, userId, query),
      insertMany: (rows) => insertTransactions(db, [...rows]),
      update: (id, patch) => updateTransaction(db, id, patch),
      deleteMany: (ids) => deleteTransactions(db, [...ids]),
      referencedContractIds: (accountId) => referencedContractIds(db, userId, accountId),
      lifecycleEvents: (contractId) => listLifecycleEvents(db, userId, contractId),
    },
    contracts: {
      find: (id) => findContractById(db, id),
      findByKey: (key) => findContractByKey(db, key),
      ensure: (parts) => ensureContract(db, parts),
      effective: (ids) => loadContractMap(db, userId, [...ids]),
      listAdjustments: (contractIds) => listAdjustments(db, userId, contractIds),
      upsertAdjustment: (contractId, input) => upsertAdjustment(db, userId, contractId, input),
      deleteAdjustment: (contractId) => deleteAdjustment(db, userId, contractId),
    },
    securities: {
      find: (symbol) => findSecurity(db, symbol),
      list: (symbols) => listSecurities(db, symbols),
      ensure: (symbol, defaults) => ensureSecurity(db, symbol, defaults),
      search: (query, limit) => searchSecurities(db, userId, query, limit),
    },
    prices: {
      latest: () => listLatestPrices(db, userId),
      quoteTimes: (symbols) => listQuoteTimes(db, symbols),
      dailyCloses: (from) => listDailyCloses(db, userId, from),
      symbolCloses: (symbol, from) => listSymbolCloses(db, symbol, from),
      symbolBars: (symbol, from) => listSymbolBars(db, symbol, from),
      coverage: (symbols) => priceCoverage(db, symbols),
      upsertLatest: (rows) => upsertLatestPrices(db, rows),
      upsertDaily: (rows) => upsertDailyPrices(db, rows),
    },
    optionQuotes: {
      latest: () => listLatestOptionQuotes(db, userId),
      daily: () => listDailyOptionQuotes(db, userId),
      quoteTimes: (contractIds) => listOptionQuoteTimes(db, userId, contractIds),
      upsertLatest: (rows) => upsertLatestOptionQuotes(db, userId, rows),
      upsertDaily: (rows) => upsertDailyOptionQuotes(db, userId, rows),
      addDaily: (rows) => addDailyOptionQuotes(db, userId, rows),
      manualMarks: () => listManualMarks(db, userId),
      setManualMark: (input) => upsertManualMark(db, { userId, ...input }),
      clearManualMark: (contractId) => deleteManualMark(db, userId, contractId),
    },
    fx: {
      listRates: () => listFxRates(db),
      upsertRates: (rows) => upsertFxRates(db, rows),
      coverage: (base, quote) => fxCoverage(db, base, quote),
    },
    snapshots: {
      listFrom: (accountId, from) => listSnapshotsFrom(db, accountId, from),
      upsert: (rows) => upsertSnapshots(db, rows),
      invalidateFrom: (accountId, date) => invalidateSnapshotsFrom(db, accountId, date),
      invalidateAccount: (accountId) => invalidateAllSnapshots(db, accountId),
      invalidateUser: () => invalidateUserSnapshots(db, userId),
    },
    providerKeys: {
      list: () => listProviderKeys(db, userId),
      find: (provider, market) => findProviderKey(db, userId, provider, market),
      save: (provider, market, key) => saveProviderKey(db, userId, provider, market, key),
      setStatus: (provider, market, status) => setKeyStatus(db, userId, provider, market, status),
      delete: (provider, market) => deleteProviderKey(db, userId, provider, market),
      deleteMarket: (market) => deleteMarketKeys(db, userId, market),
    },
    markets: {
      list: () => listMarkets(db, userId),
      save: (row) => saveMarket(db, userId, row),
      delete: (code) => deleteMarket(db, userId, code),
    },
    marketProviders: {
      list: () => listMarketProviders(db, userId),
      replaceMarket: (market, rows) => replaceMarketProviders(db, userId, market, rows),
      resetMarket: (market) => resetMarketProviders(db, userId, market),
    },
    feeSchedules: {
      find: (id) => findFeeSchedule(db, userId, id),
      saveForAccount: (accountId, input) => saveAccountFeeSchedule(db, userId, accountId, input),
      toSchedule: (row) => toFeeSchedule(row),
    },
    strategyGroups: {
      create: (input) => createStrategyGroup(db, userId, input),
      find: (id) => findStrategyGroup(db, userId, id),
    },
    users: {
      require: () => requireUser(db, userId),
      updateSettings: (patch) => updateUserSettings(db, userId, patch),
    },
    usage: {
      today: (provider, market) => usageToday(db, userId, provider, market),
      remainingBudget: (provider, market) => remainingBudget(db, userId, provider, market),
      hasDailyHeadroom: (provider, market) => hasDailyHeadroom(db, userId, provider, market),
      record: (provider, market, calls) => recordUsage(db, userId, provider, market, calls),
    },
    backup: {
      read: () => readUserData(db, userId),
      replace: (data) => replaceUserData(db, userId, data),
    },
    importMappings: {
      find: (fingerprint) => findImportMapping(db, userId, fingerprint),
      save: (fingerprint, format, mapping) => saveImportMapping(db, userId, fingerprint, format, mapping),
    },
    desktop: {
      syncBase: () => findSyncBase(db, userId),
      setSyncBase: (base) => saveSyncBase(db, userId, base),
    },
  };
}

export function createKyselyStore(db: Db): Store {
  return {
    name: 'sqlite',
    ping: async () => {
      await sql`select 1`.execute(db);
    },
    scope: (principal) => makeTx(db, principal),
    transaction: (principal, fn) => db.transaction().execute((trx) => fn(makeTx(trx, principal))),
  };
}

export type { Db };
export type { Uuid };
