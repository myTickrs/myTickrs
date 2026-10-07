import { decEquals } from '@tickrs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Principal } from '@tickrs/server/context.js';
import { newId, nowIso } from '@tickrs/server/ids.js';
import type { Uuid } from '@tickrs/server/model.js';
import type { NewTxnRow, Store } from '@tickrs/server/store/ports.js';

export interface StoreHarness {
  store: Store;
  alice: Principal;
  bob: Principal;
  close(): Promise<void>;
}

const buy = (accountId: Uuid, over: Partial<NewTxnRow> = {}): NewTxnRow => ({
  id: newId(),
  accountId,
  assetClass: 'STOCK',
  symbol: 'AAPL',
  optionContractId: null,
  type: 'BUY',
  tradeDate: '2026-01-05',
  quantity: '10',
  price: '150.00',
  fee: '1',
  feeSource: 'MANUAL',
  feeCommission: null,
  feeRegulatory: null,
  realizedBefore: null,
  amount: null,
  splitFrom: null,
  splitTo: null,
  currency: 'USD',
  linkedTxnId: null,
  isSystemGenerated: 0,
  strategyGroupId: null,
  strategyTag: null,
  notes: null,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  ...over,
});

const quote = (symbol: string, price: string, asOf: string, fetchedAt = asOf) => ({
  symbol,
  price,
  change: null,
  changePct: null,
  open: null,
  high: null,
  low: null,
  previousClose: null,
  source: 'test',
  asOf,
  fetchedAt,
});

const key = (hint: string) => ({ ciphertext: `c-${hint}`, iv: 'iv', authTag: 'tag', hint });

const marketRow = (code: string, position: number, name = code) => ({
  code,
  position,
  name,
  country: 'CA',
  timezone: 'America/Toronto',
  sessions: '[{"open":"09:30","close":"16:00"}]',
  weekdays: '[1,2,3,4,5]',
  closedDays: '["2026-07-01"]',
  holidaysThrough: 2026,
  currency: 'CAD',
  suffixes: '[]',
  testSymbol: 'RY.TO',
});

const syncBase = (email: string) => ({
  cloudUrl: 'https://cloud.example',
  account: email,
  localFingerprint: `local-${email}`,
  cloudFingerprint: `cloud-${email}`,
  syncedAt: '2026-09-30T12:00:00.000Z',
});

export function storeConformance(
  name: string,
  makeHarness: () => Promise<StoreHarness>,
  options: { backup?: boolean } = {},
) {
  const { backup = true } = options;
  describe(`storage port: ${name}`, () => {
    let h: StoreHarness;
    beforeEach(async () => {
      h = await makeHarness();
    });
    afterEach(async () => {
      await h.close();
    });

    const account = (who: Principal, accountName = 'Main') =>
      h.store.transaction(who, async (tx) => {
        await tx.securities.ensure('AAPL', { currency: 'USD' });
        return tx.accounts.create({ name: accountName, currency: 'USD' });
      });

    it('creates, reads, updates and deletes an account', async () => {
      const created = await account(h.alice, 'Brokerage');
      const found = await h.store.scope(h.alice).accounts.require(created.id);
      expect(found.name).toBe('Brokerage');

      await h.store.transaction(h.alice, (tx) => tx.accounts.update(created.id, { name: 'Renamed' }));
      expect((await h.store.scope(h.alice).accounts.list())[0]?.name).toBe('Renamed');

      await h.store.transaction(h.alice, (tx) => tx.accounts.delete(created.id));
      expect(await h.store.scope(h.alice).accounts.list()).toEqual([]);
    });

    it('refuses an account that does not exist', async () => {
      await expect(h.store.scope(h.alice).accounts.require(newId())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('keeps one principal out of another principal’s data', async () => {
      const mine = await account(h.alice, 'Mine');
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([buy(mine.id)]));

      const bobsAccounts = await h.store.scope(h.bob).accounts.list();
      const bobsRows = await h.store.scope(h.bob).transactions.listForUser();
      expect(bobsAccounts).toEqual([]);
      expect(bobsRows).toEqual([]);

      await expect(h.store.scope(h.bob).accounts.require(mine.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('keeps a strategy group to its owner, and lets a trade join it', async () => {
      const mine = await account(h.alice, 'Mine');
      const group = await h.store.transaction(h.alice, (tx) =>
        tx.strategyGroups.create({ kind: 'ROLL_CHAIN', name: 'AAPL roll chain' }),
      );
      expect(group).toMatchObject({ kind: 'ROLL_CHAIN', name: 'AAPL roll chain', strategyTag: null });
      expect(await h.store.scope(h.alice).strategyGroups.find(group.id)).toMatchObject({ id: group.id });
      expect(await h.store.scope(h.bob).strategyGroups.find(group.id)).toBeUndefined();

      const row = buy(mine.id);
      await h.store.transaction(h.alice, async (tx) => {
        await tx.transactions.insertMany([row]);
        await tx.transactions.update(row.id as Uuid, { strategyGroupId: group.id });
      });
      expect((await h.store.scope(h.alice).transactions.find(row.id as Uuid))?.strategyGroupId).toBe(
        group.id,
      );
    });

    it('returns transactions in ledger order', async () => {
      const a = await account(h.alice);
      await h.store.transaction(h.alice, (tx) =>
        tx.transactions.insertMany([
          buy(a.id, { tradeDate: '2026-03-01' }),
          buy(a.id, { tradeDate: '2026-01-05' }),
          buy(a.id, { tradeDate: '2026-02-10' }),
        ]),
      );
      const rows = await h.store.scope(h.alice).transactions.listForAccount(a.id);
      expect(rows.map((r) => r.tradeDate)).toEqual(['2026-01-05', '2026-02-10', '2026-03-01']);
    });

    it('gives decimals back exactly, as strings', async () => {
      const a = await account(h.alice);
      const row = buy(a.id, { quantity: '0.5', price: '1234.56789012', fee: '0.65' });
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([row]));

      const saved = await h.store.scope(h.alice).transactions.find(row.id as Uuid);
      expect(typeof saved?.price).toBe('string');
      expect(decEquals(saved!.price!, '1234.56789012')).toBe(true);
      expect(decEquals(saved!.quantity!, '0.5')).toBe(true);
      const plain = buy(a.id, { price: '150.00' });
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([plain]));
      const back = await h.store.scope(h.alice).transactions.find(plain.id as Uuid);
      expect(decEquals(back!.price!, '150')).toBe(true);
    });

    it('stores every short-stock row type', async () => {
      const a = await account(h.alice);
      const rows = [
        buy(a.id, { type: 'SELL_SHORT', tradeDate: '2026-01-05' }),
        buy(a.id, { type: 'DIV_PAID', tradeDate: '2026-01-06', quantity: null, price: null, amount: '2.5' }),
        buy(a.id, {
          type: 'BORROW_FEE',
          tradeDate: '2026-01-07',
          quantity: null,
          price: null,
          fee: '0',
          amount: '1.25',
        }),
        buy(a.id, { type: 'BUY_TO_COVER', tradeDate: '2026-01-08' }),
      ];
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany(rows));
      const saved = await h.store.scope(h.alice).transactions.listForAccount(a.id);
      expect(saved.map((r) => r.type)).toEqual(['SELL_SHORT', 'DIV_PAID', 'BORROW_FEE', 'BUY_TO_COVER']);
    });

    it('keeps the short-stock settings, BLOCK and REALIZED until changed', async () => {
      const before = await h.store.scope(h.alice).users.require();
      expect(before).toMatchObject({ shortBuyHandling: 'BLOCK', borrowFeeTreatment: 'REALIZED' });
      await h.store.transaction(h.alice, (tx) =>
        tx.users.updateSettings({ shortBuyHandling: 'COVER', borrowFeeTreatment: 'SEPARATE' }),
      );
      const after = await h.store.scope(h.alice).users.require();
      expect(after).toMatchObject({ shortBuyHandling: 'COVER', borrowFeeTreatment: 'SEPARATE' });
    });

    it('gives dates back as written, with no timezone drift', async () => {
      const a = await account(h.alice);
      const row = buy(a.id, { tradeDate: '2026-01-01' });
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([row]));
      const saved = await h.store.scope(h.alice).transactions.find(row.id as Uuid);
      expect(saved?.tradeDate).toBe('2026-01-01');
    });

    it('commits a unit of work as one, or not at all', async () => {
      const a = await account(h.alice);
      const boom = new Error('deliberate');
      await expect(
        h.store.transaction(h.alice, async (tx) => {
          await tx.transactions.insertMany([buy(a.id)]);
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(await h.store.scope(h.alice).transactions.listForUser()).toEqual([]);
    });

    const tradeNew = async (who: Principal) => {
      const symbol = `Z${newId().replaceAll('-', '').slice(-8).toUpperCase()}`;
      const a = await account(who);
      await h.store.transaction(who, async (tx) => {
        await tx.securities.ensure(symbol, { currency: 'USD' });
        await tx.transactions.insertMany([buy(a.id, { symbol })]);
      });
      return symbol;
    };

    it('upserts prices idempotently and reports coverage', async () => {
      const symbol = await tradeNew(h.alice);
      const rows = ['2026-01-05', '2026-01-06'].map((date) => ({
        symbol,
        date,
        open: null,
        high: null,
        low: null,
        close: '150',
        adjClose: null,
        volume: null,
        source: 'test',
      }));
      await h.store.transaction(h.alice, (tx) => tx.prices.upsertDaily(rows));
      await h.store.transaction(h.alice, (tx) =>
        tx.prices.upsertDaily(rows.map((r) => ({ ...r, close: '151' }))),
      );

      const closes = await h.store.scope(h.alice).prices.dailyCloses();
      expect(closes).toHaveLength(2);
      expect(closes.every((c) => decEquals(c.close, '151'))).toBe(true);

      const [coverage] = await h.store.scope(h.alice).prices.coverage([symbol]);
      expect(String(coverage?.first)).toBe('2026-01-05');
      expect(String(coverage?.last)).toBe('2026-01-06');
    });

    it('shares prices between users, but lists only the symbols a user has traded', async () => {
      const held = await tradeNew(h.alice);
      const other = `${held}X`;
      await h.store.transaction(h.alice, (tx) =>
        tx.prices.upsertLatest([
          quote(held, '150', '2026-01-06T20:00:00.000Z'),
          quote(other, '400', '2026-01-06T20:00:00.000Z'),
        ]),
      );
      const symbolsOf = async (who: Principal) =>
        (await h.store.scope(who).prices.latest()).map((q) => q.symbol).filter((s) => s.startsWith(held));

      expect(await symbolsOf(h.alice)).toEqual([held]);
      expect(await symbolsOf(h.bob)).toEqual([]);
      const times = await h.store.scope(h.bob).prices.quoteTimes([held, other]);
      expect(times.map((t) => t.symbol).toSorted()).toEqual([held, other].toSorted());

      const b = await account(h.bob);
      await h.store.transaction(h.bob, (tx) => tx.transactions.insertMany([buy(b.id, { symbol: held })]));
      const bobs = (await h.store.scope(h.bob).prices.latest()).filter((q) => q.symbol === held);
      expect(bobs).toHaveLength(1);
      expect(decEquals(bobs[0]!.price, '150')).toBe(true);
    });

    it('never replaces a quote with an older one, but still marks it fetched', async () => {
      const symbol = await tradeNew(h.alice);
      const upsert = (q: ReturnType<typeof quote>) =>
        h.store.transaction(h.alice, (tx) => tx.prices.upsertLatest([q]));
      const stored = async () =>
        (await h.store.scope(h.alice).prices.latest()).find((q) => q.symbol === symbol)!;
      await upsert(quote(symbol, '150', '2026-01-06T20:00:00.000Z'));
      await upsert(quote(symbol, '149', '2026-01-06T19:55:00.000Z', '2026-01-06T20:05:00.000Z'));

      const kept = await stored();
      expect(decEquals(kept.price, '150')).toBe(true);
      expect(String(kept.asOf)).toContain('2026-01-06T20:00:00');
      const [time] = await h.store.scope(h.alice).prices.quoteTimes([symbol]);
      expect(String(time!.fetchedAt)).toContain('2026-01-06T20:05:00');

      await upsert(quote(symbol, '151', '2026-01-07T20:00:00.000Z'));
      expect(decEquals((await stored()).price, '151')).toBe(true);
    });

    it('stores, reads and clears a manual option mark', async () => {
      const contract = await h.store.transaction(h.alice, async (tx) => {
        await tx.securities.ensure('AAPL', { currency: 'USD' });
        return tx.contracts.ensure({
          underlying: 'AAPL',
          expiration: '2026-10-16',
          strike: '200',
          right: 'PUT',
        });
      });
      await h.store.transaction(h.alice, (tx) =>
        tx.optionQuotes.setManualMark({ optionContractId: contract.id, mark: '3.25', asOf: '2026-09-18' }),
      );
      const marks = await h.store.scope(h.alice).optionQuotes.manualMarks();
      expect(marks).toHaveLength(1);
      expect(decEquals(marks[0]!.mark, '3.25')).toBe(true);

      await h.store.transaction(h.alice, (tx) => tx.optionQuotes.clearManualMark(contract.id));
      expect(await h.store.scope(h.alice).optionQuotes.manualMarks()).toEqual([]);
    });

    it('keeps each user’s own option quotes, never letting an older one replace a newer', async () => {
      const contract = await h.store.transaction(h.alice, async (tx) => {
        await tx.securities.ensure('AAPL', { currency: 'USD' });
        return tx.contracts.ensure({
          underlying: 'AAPL',
          expiration: '2026-10-16',
          strike: '190',
          right: 'PUT',
        });
      });
      const optionQuote = (last: string, asOf: string, fetchedAt = asOf) => ({
        optionContractId: contract.id,
        bid: null,
        ask: null,
        last,
        mark: null,
        iv: '0.3',
        delta: null,
        gamma: null,
        theta: null,
        vega: null,
        previousClose: '2.7',
        source: 'test',
        asOf,
        fetchedAt,
      });
      const alice = () => h.store.scope(h.alice).optionQuotes;
      await h.store.transaction(h.alice, (tx) =>
        tx.optionQuotes.upsertLatest([optionQuote('2.5', '2026-09-18T20:00:00.000Z')]),
      );
      await h.store.transaction(h.alice, (tx) =>
        tx.optionQuotes.upsertLatest([
          optionQuote('2.1', '2026-09-18T19:00:00.000Z', '2026-09-18T20:10:00.000Z'),
        ]),
      );
      const [latest] = await alice().latest();
      expect(decEquals(latest!.last!, '2.5')).toBe(true);
      expect(decEquals(latest!.previousClose!, '2.7')).toBe(true);
      const [time] = await alice().quoteTimes([contract.id]);
      expect(String(time!.fetchedAt)).toContain('2026-09-18T20:10:00');
      expect(await h.store.scope(h.bob).optionQuotes.latest()).toEqual([]);
      expect(await h.store.scope(h.bob).optionQuotes.quoteTimes([contract.id])).toEqual([]);

      const daily = (last: string) => ({
        optionContractId: contract.id,
        date: '2026-09-18',
        bid: null,
        ask: null,
        last,
        mark: null,
        volume: null,
        openInterest: null,
        iv: null,
        delta: null,
        theta: null,
        source: 'test',
      });
      await h.store.transaction(h.alice, (tx) => tx.optionQuotes.upsertDaily([daily('2.4')]));
      await h.store.transaction(h.alice, (tx) => tx.optionQuotes.upsertDaily([daily('2.6')]));
      const days = await alice().daily();
      expect(days).toHaveLength(1);
      expect(decEquals(days[0]!.last!, '2.6')).toBe(true);

      await h.store.transaction(h.alice, (tx) =>
        tx.optionQuotes.addDaily([daily('2.2'), { ...daily('2.3'), date: '2026-09-17' }]),
      );
      const filled = await alice().daily();
      expect(filled.map((d) => [d.date, Number(d.last)])).toEqual([
        ['2026-09-17', 2.3],
        ['2026-09-18', 2.6],
      ]);
    });

    it('invalidates cached snapshots from a date onward', async () => {
      const a = await account(h.alice);
      const day = (date: string) => ({
        accountId: a.id,
        date,
        positionsValue: '2',
        marketValue: '3',
        netContributions: '4',
        twrIndex: '1',
        isEstimated: 0 as const,
      });
      await h.store.transaction(h.alice, (tx) =>
        tx.snapshots.upsert([day('2026-01-05'), day('2026-01-06'), day('2026-01-07')]),
      );
      await h.store.transaction(h.alice, (tx) => tx.snapshots.invalidateFrom(a.id, '2026-01-06'));

      const left = await h.store.scope(h.alice).snapshots.listFrom(a.id, '2020-01-01');
      expect(left.map((s) => s.date)).toEqual(['2026-01-05']);
    });

    it('saves an account fee schedule and reads it back as the engine wants it', async () => {
      const a = await account(h.alice);
      await h.store.transaction(h.alice, (tx) =>
        tx.feeSchedules.saveForAccount(a.id, { name: 'Broker', optionPerContract: '0.65' }),
      );
      const updated = await h.store.scope(h.alice).accounts.require(a.id);
      const data = h.store.scope(h.alice);
      const schedule = data.feeSchedules.toSchedule(await data.feeSchedules.find(updated.feeScheduleId));
      expect(schedule.optionPerContract).toBeDefined();
      expect(decEquals(schedule.optionPerContract!, '0.65')).toBe(true);
    });

    it('refuses an option row that names no contract', async () => {
      const a = await account(h.alice);
      await expect(
        h.store.transaction(h.alice, (tx) =>
          tx.transactions.insertMany([buy(a.id, { assetClass: 'OPTION', type: 'STO' })]),
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it('refuses a type that does not belong to its asset class', async () => {
      const a = await account(h.alice);
      await expect(
        h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([buy(a.id, { type: 'BTO' })])),
      ).rejects.toBeInstanceOf(Error);
    });

    it('refuses a trade in a security it has never heard of', async () => {
      const a = await account(h.alice);
      await expect(
        h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([buy(a.id, { symbol: 'NOSUCH' })])),
      ).rejects.toBeInstanceOf(Error);
    });

    it('gives timestamps back as ISO-8601 UTC strings', async () => {
      const a = await account(h.alice);
      const at = '2026-09-21T14:30:00.000Z';
      const row = buy(a.id, { createdAt: at, updatedAt: at });
      await h.store.transaction(h.alice, (tx) => tx.transactions.insertMany([row]));
      const saved = await h.store.scope(h.alice).transactions.find(row.id as Uuid);
      expect(saved?.createdAt).toBe(at);
    });

    it('keeps an API key and its usage per provider per market', async () => {
      await h.store.transaction(h.alice, async (tx) => {
        await tx.providerKeys.save('finnhub', 'US', key('1111'));
        await tx.providerKeys.save('finnhub', 'CA', key('2222'));
        await tx.providerKeys.save('finnhub', 'CA', key('3333'));
        await tx.providerKeys.setStatus('finnhub', 'US', 'VALID');
        await tx.usage.record('finnhub', 'US', 2);
        await tx.usage.record('finnhub', 'CA', 5);
      });
      const alice = h.store.scope(h.alice);
      expect(
        (await alice.providerKeys.list()).map((k) => [k.provider, k.market, k.keyHint, k.status]),
      ).toEqual([
        ['finnhub', 'CA', '3333', 'UNTESTED'],
        ['finnhub', 'US', '1111', 'VALID'],
      ]);
      expect((await alice.providerKeys.find('finnhub', 'CA'))?.keyHint).toBe('3333');
      expect(await alice.usage.today('finnhub', 'US')).toBe(2);
      expect(await alice.usage.today('finnhub', 'CA')).toBe(5);
      expect(await h.store.scope(h.bob).providerKeys.list()).toEqual([]);

      await h.store.transaction(h.alice, (tx) => tx.providerKeys.deleteMarket('CA'));
      expect((await alice.providerKeys.list()).map((k) => k.market)).toEqual(['US']);
      await h.store.transaction(h.alice, (tx) => tx.providerKeys.delete('finnhub', 'US'));
      expect(await alice.providerKeys.list()).toEqual([]);
    });

    it('keeps markets per principal, in order, replacing by code', async () => {
      await h.store.transaction(h.alice, async (tx) => {
        await tx.markets.save(marketRow('CA', 1));
        await tx.markets.save(marketRow('US', 0));
        await tx.markets.save(marketRow('CA', 1, 'Canada'));
      });
      const mine = await h.store.scope(h.alice).markets.list();
      expect(mine.map((m) => [m.code, m.name])).toEqual([
        ['US', 'US'],
        ['CA', 'Canada'],
      ]);
      expect(mine[1]).toMatchObject({ country: 'CA', closedDays: '["2026-07-01"]', holidaysThrough: 2026 });
      expect(await h.store.scope(h.bob).markets.list()).toEqual([]);

      await h.store.transaction(h.alice, (tx) => tx.markets.delete('CA'));
      expect((await h.store.scope(h.alice).markets.list()).map((m) => m.code)).toEqual(['US']);
    });

    it('keeps a market’s provider table per principal, replacing and resetting it a market at a time', async () => {
      const replace = (
        who: Principal,
        market: 'US' | 'CA',
        rows: { provider: string; priority: number; enabled: boolean }[],
      ) => h.store.transaction(who, (tx) => tx.marketProviders.replaceMarket(market, rows));
      await replace(h.alice, 'US', [
        { provider: 'twelvedata', priority: 2, enabled: true },
        { provider: 'finnhub', priority: 1, enabled: false },
      ]);
      await replace(h.alice, 'CA', [{ provider: 'acme', priority: 7, enabled: true }]);
      expect(await h.store.scope(h.alice).marketProviders.list()).toEqual([
        { market: 'CA', provider: 'acme', priority: 7, enabled: true },
        { market: 'US', provider: 'finnhub', priority: 1, enabled: false },
        { market: 'US', provider: 'twelvedata', priority: 2, enabled: true },
      ]);
      expect(await h.store.scope(h.bob).marketProviders.list()).toEqual([]);

      await replace(h.alice, 'US', [{ provider: 'acme', priority: 1, enabled: true }]);
      await h.store.scope(h.alice).marketProviders.resetMarket('CA');
      expect(await h.store.scope(h.alice).marketProviders.list()).toEqual([
        { market: 'US', provider: 'acme', priority: 1, enabled: true },
      ]);
    });

    it('keeps a list of currencies per principal, adding only what is missing', async () => {
      const add = (who: Principal, rows: { code: string; name: string }[]) =>
        h.store.transaction(who, (tx) => tx.currencies.add(rows));
      await add(h.alice, [
        { code: 'USD', name: 'US Dollar' },
        { code: 'EUR', name: 'Euro' },
      ]);
      await add(h.alice, [
        { code: 'EUR', name: 'Renamed' },
        { code: 'CAD', name: 'Canadian Dollar' },
      ]);
      const mine = await h.store.scope(h.alice).currencies.list();
      expect(mine.map((c) => [c.code, c.name])).toEqual([
        ['CAD', 'Canadian Dollar'],
        ['EUR', 'Euro'],
        ['USD', 'US Dollar'],
      ]);
      expect(await h.store.scope(h.bob).currencies.list()).toEqual([]);

      await h.store.transaction(h.alice, (tx) => tx.currencies.delete('EUR'));
      expect((await h.store.scope(h.alice).currencies.list()).map((c) => c.code)).toEqual(['CAD', 'USD']);
    });

    it('counts the accounts and transactions in each currency, for its owner only', async () => {
      const a = await account(h.alice);
      await h.store.transaction(h.alice, async (tx) => {
        await tx.accounts.create({ name: 'TFSA', currency: 'CAD' });
        await tx.transactions.insertMany([buy(a.id), buy(a.id), buy(a.id, { currency: 'CAD' })]);
      });
      expect(await h.store.scope(h.alice).currencies.usage()).toEqual([
        { code: 'CAD', accounts: 1, transactions: 1 },
        { code: 'USD', accounts: 1, transactions: 2 },
      ]);
      expect(await h.store.scope(h.bob).currencies.usage()).toEqual([]);
    });

    it.skipIf(!backup)(
      'backs up a principal’s data and replaces it, leaving another principal’s alone',
      async () => {
        const mine = await account(h.alice, 'Before');
        const linkedA = buy(mine.id);
        const linkedB = buy(mine.id, { type: 'SELL', tradeDate: '2026-01-06', linkedTxnId: linkedA.id });
        await h.store.transaction(h.alice, async (tx) => {
          await tx.transactions.insertMany([linkedA, { ...linkedB, linkedTxnId: null }]);
          await tx.transactions.update(linkedB.id as Uuid, { linkedTxnId: linkedA.id });
        });
        const bobs = await account(h.bob, 'Bob’s');
        await h.store.transaction(h.bob, (tx) => tx.transactions.insertMany([buy(bobs.id)]));

        const saved = await h.store.scope(h.alice).backup.read();
        expect(saved.accounts.map((a) => a.name)).toEqual(['Before']);
        expect(saved.transactions.map((t) => t.id)).toEqual([linkedA.id, linkedB.id]);
        expect(JSON.stringify(saved)).not.toContain(bobs.id);

        await h.store.transaction(h.alice, async (tx) => {
          await tx.accounts.create({ name: 'After', currency: 'USD' });
          await tx.users.updateSettings({
            averagePriceScope: saved.settings.averagePriceScope === 'CURRENT' ? 'LIFETIME' : 'CURRENT',
          });
        });
        await h.store.transaction(h.alice, (tx) => tx.backup.replace(saved));

        const restored = await h.store.scope(h.alice).backup.read();
        expect(restored.accounts.map((a) => a.name)).toEqual(['Before']);
        expect(restored.settings).toEqual(saved.settings);
        expect(restored.transactions.find((t) => t.id === linkedB.id)?.linkedTxnId).toBe(linkedA.id);
        expect((await h.store.scope(h.bob).accounts.list()).map((a) => a.name)).toEqual(['Bob’s']);
        expect(await h.store.scope(h.bob).transactions.listForUser()).toHaveLength(1);
      },
    );

    it('keeps a sync base per principal, replacing it and clearing it with null', async (test) => {
      const desktop = h.store.scope(h.alice).desktop;
      if (!desktop) return test.skip();
      expect(await desktop.syncBase()).toBeNull();

      await desktop.setSyncBase(syncBase('alice@example.com'));
      await h.store.scope(h.bob).desktop!.setSyncBase(syncBase('bob@example.com'));
      expect(await desktop.syncBase()).toEqual(syncBase('alice@example.com'));

      const later = {
        ...syncBase('alice@example.com'),
        localFingerprint: 'after',
        syncedAt: '2026-10-01T08:00:00.000Z',
      };
      await h.store.transaction(h.alice, (tx) => tx.desktop!.setSyncBase(later));
      expect(await desktop.syncBase()).toEqual(later);

      await desktop.setSyncBase(null);
      expect(await desktop.syncBase()).toBeNull();
      expect(await h.store.scope(h.bob).desktop!.syncBase()).toEqual(syncBase('bob@example.com'));
    });

    it.skipIf(!backup)('leaves the sync base alone when a backup replaces the data', async (test) => {
      const desktop = h.store.scope(h.alice).desktop;
      if (!desktop) return test.skip();
      await account(h.alice);
      await desktop.setSyncBase(syncBase('alice@example.com'));
      const saved = await h.store.scope(h.alice).backup.read();
      await h.store.transaction(h.alice, (tx) => tx.backup.replace({ ...saved, accounts: [] }));
      expect(await desktop.syncBase()).toEqual(syncBase('alice@example.com'));
    });

    it('stores the auto-expired flag, 0 unless set', async () => {
      const mine = await account(h.alice);
      const plain = buy(mine.id);
      const auto = buy(mine.id, { tradeDate: '2026-01-07', isAutoExpired: 1 });
      await h.store.transaction(h.alice, async (tx) => {
        await tx.transactions.insertMany([plain]);
        await tx.transactions.insertMany([auto]);
      });
      const tx = h.store.scope(h.alice).transactions;
      expect((await tx.find(plain.id as Uuid))?.isAutoExpired).toBe(0);
      expect((await tx.find(auto.id as Uuid))?.isAutoExpired).toBe(1);
      await tx.update(auto.id as Uuid, { isAutoExpired: 0 });
      expect((await tx.find(auto.id as Uuid))?.isAutoExpired).toBe(0);
    });

    it('answers a health check', async () => {
      await expect(h.store.ping()).resolves.toBeUndefined();
      expect(h.store.name.length).toBeGreaterThan(0);
    });
  });
}
