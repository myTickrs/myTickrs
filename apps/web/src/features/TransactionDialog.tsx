import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AutocompleteField, Badge, Banner, Button, Col, Field, Row, Select, Text } from '@tickrs/ui';
import { Dialog } from '@tickrs/ui';
import { t as translate, useT } from '../i18n.js';
import { accountNameFor } from './AccountDialog.js';
import {
  ApiError,
  api,
  errorText,
  fieldErrorsOf,
  type Account,
  type KnownContractTerms,
  type OptionPosition,
  type Transaction,
} from '../lib/api.js';
import { formatMoney, toDecimalInput, todayIso, typeLabel } from '../lib/format.js';
import { listingIn, optionTermsOf, optionUnderlying, splitListing } from '../lib/markets.js';
import {
  addAccounts,
  keys,
  quoteFee,
  useLedgerMutation,
  useMarkets,
  useSecuritySearch,
} from '../lib/queries.js';

type Kind = 'STOCK' | 'OPTION';

const stockTypes = () => [
  { value: 'BUY', label: typeLabel('BUY') },
  { value: 'SELL', label: typeLabel('SELL') },
  { value: 'SELL_SHORT', label: typeLabel('SELL_SHORT') },
  { value: 'BUY_TO_COVER', label: typeLabel('BUY_TO_COVER') },
  { value: 'DIV_CASH', label: translate('transactionDialog.dividendCash') },
  { value: 'DIV_REINVEST', label: translate('transactionDialog.dividendReinvested') },
  { value: 'DIV_PAID', label: translate('transactionDialog.dividendPaid') },
  { value: 'BORROW_FEE', label: typeLabel('BORROW_FEE') },
  { value: 'SPLIT', label: typeLabel('SPLIT') },
];
const optionTypes = () =>
  ['BTO', 'STO', 'BTC', 'STC', 'EXP', 'ASN', 'EXR'].map((value) => ({ value, label: typeLabel(value) }));

const needsQuantityPrice = (type: string) =>
  ['BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER', 'DIV_REINVEST', 'BTO', 'STO', 'BTC', 'STC'].includes(type);
const isAmount = (type: string) => ['DIV_CASH', 'DIV_PAID', 'BORROW_FEE'].includes(type);
const isOptionLifecycle = (type: string) => ['EXP', 'ASN', 'EXR'].includes(type);

export interface TransactionDialogProps {
  open: boolean;
  onClose(): void;
  accounts: Account[];
  defaultAccountId?: string;
  defaultSymbol?: string;
  defaultType?: string;
  onSaved?(created: Transaction[]): void;
  mode?: 'transaction' | 'option';
  closing?: OptionPosition | null;
}

export function TransactionDialog({
  open,
  onClose,
  accounts,
  defaultAccountId,
  defaultSymbol = '',
  defaultType = 'BUY',
  onSaved,
  mode = 'transaction',
  closing = null,
}: TransactionDialogProps) {
  const t = useT();
  const kind: Kind = mode === 'option' ? 'OPTION' : 'STOCK';
  const [type, setType] = useState(
    closing ? (closing.side === 'SHORT' ? 'BTC' : 'STC') : mode === 'option' ? 'STO' : defaultType,
  );
  const [chosenAccountId, setAccountId] = useState(closing?.accounts[0]?.id ?? '');
  const accountId = chosenAccountId || defaultAccountId || accounts[0]?.id || '';
  const [tradeDate, setTradeDate] = useState(todayIso());
  const [symbol, setSymbol] = useState(closing?.underlying ?? defaultSymbol);
  const [quantity, setQuantity] = useState(closing?.contracts ?? '');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [splitFrom, setSplitFrom] = useState('1');
  const [splitTo, setSplitTo] = useState('2');
  const [expiration, setExpiration] = useState(closing?.expiration ?? '');
  const [strike, setStrike] = useState(closing?.strike ?? '');
  const [right, setRight] = useState<'CALL' | 'PUT'>(closing?.right ?? 'CALL');
  const [multiplier, setMultiplier] = useState('');
  const [sizeTyped, setSizeTyped] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmNegativeStock, setConfirmNegativeStock] = useState(false);
  const [mismatchCurrency, setMismatchCurrency] = useState<string | null>(null);
  const [addingPortfolio, setAddingPortfolio] = useState(false);
  const client = useQueryClient();

  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency ?? 'USD';
  const currency = accountCurrency;

  const chargesFee = needsQuantityPrice(type) || type === 'ASN' || type === 'EXR';
  const feeQuote = useQuery({
    enabled: open && Boolean(accountId) && chargesFee,
    queryKey: ['fee-quote', accountId, type, quantity, price],
    queryFn: () => quoteFee({ accountId, type, quantity: quantity || '1', price: price || '0' }),
    retry: false,
  });
  const feeAuto = feeQuote.data?.total ?? null;

  const search = useSecuritySearch(symbol, open);
  const markets = useMarkets(open);
  const marketList = Array.isArray(markets.data?.items) ? markets.data.items : [];
  const [chosenMarket, setMarket] = useState('');
  const typed = symbol.trim().toUpperCase();
  const known = (search.data?.items ?? []).some((s) => s.symbol === typed);
  const needsMarket =
    kind === 'STOCK' &&
    marketList.length > 1 &&
    typed !== '' &&
    !known &&
    !splitListing(marketList, typed).suffix;
  const market =
    chosenMarket ||
    marketList.find((m) => m.currency === accountCurrency)?.code ||
    marketList.find((m) => m.isHome)?.code ||
    '';
  const listing = needsMarket ? listingIn(marketList, typed, market) : symbol;

  const underlying = kind === 'OPTION' ? optionUnderlying(marketList, typed, accountCurrency) : '';
  const knownTerms = useQuery({
    enabled: open && kind === 'OPTION' && !closing && typed !== '',
    queryKey: ['contract-terms', typed, expiration, strike, right, accountCurrency],
    queryFn: () =>
      api.get<KnownContractTerms>(
        `/options/contracts/terms?${new URLSearchParams({
          underlying: typed,
          currency: accountCurrency,
          ...(expiration ? { expiration } : {}),
          ...(strike.trim() ? { strike: toDecimalInput(strike) } : {}),
          right,
        }).toString()}`,
      ),
    retry: false,
  });
  const recorded =
    knownTerms.data?.source === 'CONTRACT' || knownTerms.data?.source === 'UNDERLYING'
      ? knownTerms.data
      : null;
  const terms = closing
    ? { multiplier: closing.multiplier, style: closing.style, settlement: closing.settlement }
    : recorded?.multiplier && recorded.style && recorded.settlement
      ? { multiplier: recorded.multiplier, style: recorded.style, settlement: recorded.settlement }
      : optionTermsOf(marketList, underlying);
  const unsupported = kind === 'OPTION' && marketList.length > 0 && underlying !== '' && !terms;
  const size = terms?.multiplier ?? (marketList.length === 0 ? '100' : null);
  const sizeValue = sizeTyped ? multiplier : (recorded?.multiplier ?? size ?? '');
  const isIndex = underlying.startsWith('^');
  const cashSettled = terms?.settlement === 'CASH';
  const settles = type === 'ASN' || type === 'EXR';
  const earlyExercise =
    terms?.style === 'EUROPEAN' && settles && expiration !== '' && tradeDate !== expiration;

  const suggestions = (search.data?.items ?? []).map((s) => ({
    value: s.symbol,
    label: s.symbol,
    detail: [s.name, s.exchange, s.currency].filter(Boolean).join(' · '),
    currency: s.currency,
  }));

  const save = useLedgerMutation(async () => {
    const base: Record<string, unknown> = { accountId, tradeDate, assetClass: kind, type };
    if (notes) base.notes = notes;
    if (fee !== '') base.fee = toDecimalInput(fee);
    const [qty, px] = [toDecimalInput(quantity), toDecimalInput(price)];

    if (kind === 'STOCK') {
      base.symbol = listing;
      const picked = search.data?.items?.find((s) => s.symbol === listing.trim().toUpperCase());
      if (picked?.currency) base.currency = picked.currency;
      if (type === 'SPLIT') {
        base.splitFrom = toDecimalInput(splitFrom);
        base.splitTo = toDecimalInput(splitTo);
        delete base.fee;
      } else if (isAmount(type)) {
        base.amount = toDecimalInput(amount);
        if (type === 'BORROW_FEE') delete base.fee;
      } else {
        base.quantity = qty;
        base.price = px;
      }
    } else {
      base.contract = {
        underlying: symbol,
        expiration,
        strike: toDecimalInput(strike),
        right,
        ...(sizeValue.trim() ? { multiplier: toDecimalInput(sizeValue) } : {}),
      };
      if (needsQuantityPrice(type)) {
        base.quantity = qty;
        base.price = px;
      } else if (type !== 'EXP') base.quantity = qty;
      else if (quantity.trim()) base.quantity = qty;
      if (settles && cashSettled) base.price = px;
      if (confirmNegativeStock) base.confirmNegativeStock = true;
    }
    return api.post<{ items: Transaction[] }>('/transactions', base);
  });

  const submit = () => {
    setErrors({});
    setFormError(null);
    setMismatchCurrency(null);
    save.mutate(undefined as never, {
      onSuccess: (data) => {
        onSaved?.(data.items);
        setQuantity('');
        setPrice('');
        setAmount('');
        setFee('');
        onClose();
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError) {
          setErrors(fieldErrorsOf(error));
          setFormError(errorText(error, t('transactionDialog.saveFailed')));
          if (error.code === 'CONFIRMATION_REQUIRED') setConfirmNegativeStock(true);
          const refused = (error.details as { currency?: unknown } | undefined)?.currency;
          if (error.code === 'CURRENCY_MISMATCH' && typeof refused === 'string') setMismatchCurrency(refused);
        } else {
          setFormError(t('transactionDialog.saveFailed'));
        }
      },
    });
  };

  const addPortfolio = async (code: string) => {
    const name = accountNameFor(t('import.newAccountName'), code);
    setAddingPortfolio(true);
    try {
      const existing = accounts.find((a) => a.name === name && a.currency === code);
      const id = existing?.id ?? (await addAccounts([{ name, broker: null, currency: code }])).items[0]?.id;
      await client.invalidateQueries({ queryKey: keys.accounts });
      if (id) setAccountId(id);
      setMismatchCurrency(null);
      setFormError(null);
    } catch (error: unknown) {
      setFormError(errorText(error, t('transactionDialog.addPortfolioFailed')));
    } finally {
      setAddingPortfolio(false);
    }
  };

  const types = kind === 'STOCK' ? stockTypes() : optionTypes();
  const showsQuantity = needsQuantityPrice(type) || (kind === 'OPTION' && isOptionLifecycle(type));
  const sizeField = kind === 'OPTION' && !closing && (
    <Field
      label={t('transactionDialog.contractSize')}
      value={sizeValue}
      onChange={(v) => {
        setSizeTyped(true);
        setMultiplier(v);
      }}
      error={errors.multiplier}
      placeholder={size ?? ''}
      hint={t('transactionDialog.contractSizeShares')}
      required
      requiredMessage={t('transactionDialog.contractSizeRequired')}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        closing
          ? t('transactionDialog.closeOption')
          : mode === 'option'
            ? t('transactionDialog.addOption')
            : t('transactionDialog.addTransaction')
      }
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose} variant="text">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {confirmNegativeStock ? t('transactionDialog.confirmAndSave') : t('common.save')}
          </Button>
        </>
      }
    >
      <Col gap={2}>
        {formError && (
          <Banner
            tone={confirmNegativeStock ? 'warning' : 'error'}
            title={confirmNegativeStock ? t('transactionDialog.confirm') : undefined}
            action={
              mismatchCurrency && (
                <Button
                  variant="text"
                  disabled={addingPortfolio}
                  onClick={() => void addPortfolio(mismatchCurrency)}
                >
                  {t('transactionDialog.addPortfolio')}
                </Button>
              )
            }
          >
            {formError}
          </Banner>
        )}

        <Row gap={2} responsive align="start">
          <Select
            label={t('common.account')}
            value={accountId}
            onChange={setAccountId}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <Select label={t('common.type')} value={type} onChange={setType} options={types} />
          <Field
            label={t('common.date')}
            type="date"
            value={tradeDate}
            onChange={setTradeDate}
            error={errors.tradeDate}
          />
        </Row>

        <Row gap={2} responsive align="start">
          <AutocompleteField
            label={kind === 'OPTION' ? t('transactionDialog.underlying') : t('transactionDialog.ticker')}
            value={symbol}
            onChange={(v) => {
              setSymbol(v.toUpperCase());
              setSizeTyped(false);
              setMultiplier('');
            }}
            suggestions={suggestions}
            loading={search.isFetching}
            error={errors.symbol}
            hint={
              kind === 'STOCK'
                ? t('transactionDialog.tickerHint', { currency: accountCurrency })
                : unsupported
                  ? t('transactionDialog.optionsNotSupported', { symbol: underlying })
                  : underlying !== '' && underlying !== typed
                    ? t('transactionDialog.recordedAs', { symbol: underlying })
                    : t('transactionDialog.underlyingHint')
            }
            required
          />
          {needsMarket && (
            <Select
              label={t('transactionDialog.market')}
              value={market}
              onChange={setMarket}
              options={marketList.map((m) => ({ value: m.code, label: `${m.name} (${m.currency})` }))}
              hint={t('transactionDialog.marketHint', { symbol: listing })}
            />
          )}
        </Row>

        {kind === 'OPTION' && (
          <Row gap={2} responsive align="start">
            <Field
              label={t('common.expiration')}
              type="date"
              value={expiration}
              onChange={setExpiration}
              required
            />
            <Field label={t('common.strike')} value={strike} onChange={setStrike} required />
            <Select
              label={t('transactionDialog.callPut')}
              value={right}
              onChange={(v) => setRight(v === 'PUT' ? 'PUT' : 'CALL')}
              options={[
                { value: 'CALL', label: t('common.call') },
                { value: 'PUT', label: t('common.put') },
              ]}
            />
          </Row>
        )}

        {kind === 'STOCK' && type === 'SPLIT' && (
          <Row gap={2} align="start">
            <Field label={t('transactionDialog.splitFrom')} value={splitFrom} onChange={setSplitFrom} />
            <Field
              label={t('transactionDialog.splitTo')}
              value={splitTo}
              onChange={setSplitTo}
              hint={t('transactionDialog.splitHint')}
            />
          </Row>
        )}

        {showsQuantity && (
          <Row gap={2} responsive align="start">
            {sizeField}
            <Field
              label={kind === 'OPTION' ? t('transactionDialog.contracts') : t('common.quantity')}
              value={quantity}
              onChange={setQuantity}
              error={errors.quantity}
              hint={
                kind !== 'OPTION'
                  ? undefined
                  : type === 'EXP'
                    ? t('transactionDialog.contractsHintExpire')
                    : isIndex
                      ? t('transactionDialog.contractsHintIndex', { size: size ?? '', currency })
                      : t('transactionDialog.contractsHint', { size: size ?? '100' })
              }
              required={type !== 'EXP'}
            />
            {needsQuantityPrice(type) && (
              <Field
                label={
                  kind === 'OPTION'
                    ? t('transactionDialog.premiumPerShare')
                    : t('transactionDialog.pricePerShare')
                }
                value={price}
                onChange={setPrice}
                error={errors.price}
                hint={
                  kind === 'OPTION' ? t('transactionDialog.premiumHint', { size: size ?? '100' }) : undefined
                }
                required
              />
            )}
            {kind === 'OPTION' && settles && cashSettled && (
              <Field
                label={t('transactionDialog.settlementPrice')}
                value={price}
                onChange={setPrice}
                error={errors.price}
                hint={t('transactionDialog.settlementPriceHint')}
                required
              />
            )}
          </Row>
        )}

        {kind === 'STOCK' && isAmount(type) && (
          <Row gap={2} responsive align="start">
            <Field
              label={t('common.amount')}
              value={amount}
              onChange={setAmount}
              error={errors.amount}
              hint={
                type === 'DIV_PAID'
                  ? t('transactionDialog.dividendPaidHint')
                  : type === 'BORROW_FEE'
                    ? t('transactionDialog.borrowFeeHint')
                    : undefined
              }
              required
            />
          </Row>
        )}

        {type !== 'SPLIT' && type !== 'BORROW_FEE' && (
          <Row gap={2} responsive>
            <Field
              label={t('common.fee')}
              value={fee}
              onChange={setFee}
              error={errors.fee}
              hint={
                feeAuto
                  ? t('transactionDialog.feeFromSchedule', { fee: formatMoney(feeAuto, currency) })
                  : t('transactionDialog.feeLeaveEmpty')
              }
              placeholder={feeAuto ?? '0'}
            />
            {feeAuto && fee === '' && <Badge label={t('transactionDialog.calculated')} tone="info" />}
          </Row>
        )}

        <Field label={t('common.notes')} value={notes} onChange={setNotes} />
        {earlyExercise && (
          <Banner tone="warning">{t('transactionDialog.europeanStyle', { date: expiration })}</Banner>
        )}
        {kind === 'OPTION' && (
          <Text variant="caption" muted>
            {cashSettled ? t('transactionDialog.lifecycleNoteCash') : t('transactionDialog.lifecycleNote')}
          </Text>
        )}
      </Col>
    </Dialog>
  );
}
