import { Banner, Button, Col, Dialog, Divider, Field, Row, Select, Text } from '@tickrs/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useT } from '../i18n.js';
import { api, ApiError, errorText, type OptionPosition } from '../lib/api.js';
import { formatMoney, rightLabel, toDecimalInput, todayIso } from '../lib/format.js';
import { useAccounts, useLedgerMutation } from '../lib/queries.js';

const DECIMAL = /^\d+(\.\d+)?$/;
const WHOLE = /^[1-9]\d*$/;

interface RollPreview {
  netPremium: string;
  fees: [string, string];
}

type Choice = { accountId: string; contracts: string };

const choicesOf = (e: unknown): Choice[] | null =>
  e instanceof ApiError && e.code === 'ACCOUNT_REQUIRED'
    ? ((e.details as { accounts?: Choice[] }).accounts ?? [])
    : null;

export function RollDialog({ position, onClose }: { position: OptionPosition | null; onClose(): void }) {
  const t = useT();
  const [tradeDate, setTradeDate] = useState(todayIso());
  const [quantity, setQuantity] = useState(position?.contracts ?? '1');
  const [closePrice, setClosePrice] = useState('');
  const [expiration, setExpiration] = useState('');
  const [strike, setStrike] = useState(position?.strike ?? '');
  const [openPrice, setOpenPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accountChoices, setAccountChoices] = useState<Choice[]>([]);
  const [accountId, setAccountId] = useState('');
  const accounts = useAccounts();

  const [close, newStrike, open] = [
    toDecimalInput(closePrice),
    toDecimalInput(strike),
    toDecimalInput(openPrice),
  ];
  const complete =
    WHOLE.test(quantity) &&
    DECIMAL.test(close) &&
    Boolean(expiration) &&
    DECIMAL.test(newStrike) &&
    DECIMAL.test(open);
  const body = {
    optionContractId: position?.contractId,
    ...(accountId ? { accountId } : {}),
    tradeDate,
    quantity,
    close: { price: close },
    open: { expiration, strike: newStrike, price: open },
  };
  const preview = useQuery({
    queryKey: ['roll-preview', body],
    queryFn: () => api.post<RollPreview>('/options/rolls', { ...body, dryRun: true }),
    enabled: Boolean(position) && complete,
    retry: false,
    staleTime: 30_000,
  });
  const roll = useLedgerMutation((b: typeof body) => api.post('/options/rolls', b));
  if (!position) return null;

  const short = position.side === 'SHORT';
  const nameOf = (id: string) => accounts.data?.items.find((a) => a.id === id)?.name ?? t('common.account');
  const choices = accountChoices.length > 0 ? accountChoices : (choicesOf(preview.error) ?? []);
  const previewProblem =
    preview.error && !choicesOf(preview.error) ? errorText(preview.error, t('roll.checkFailed')) : null;

  const submit = () => {
    const problem = !WHOLE.test(quantity)
      ? t('roll.enterContracts')
      : !DECIMAL.test(close)
        ? t('roll.enterClosePrice')
        : !expiration
          ? t('roll.chooseExpiration')
          : !DECIMAL.test(newStrike)
            ? t('roll.enterStrike')
            : !DECIMAL.test(open)
              ? t('roll.enterOpenPrice')
              : choices.length > 0 && !accountId
                ? t('roll.chooseAccountToRoll')
                : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    roll.mutate(body, {
      onSuccess: onClose,
      onError: (e) => {
        const more = choicesOf(e);
        if (more) {
          setAccountChoices(more);
          setError(t('roll.severalAccounts'));
          return;
        }
        setError(errorText(e, t('roll.failed')));
      },
    });
  };

  return (
    <Dialog open title={t('roll.title')} onClose={onClose} onSubmit={submit}>
      <Col gap={2}>
        <Text muted>
          {t('roll.summary', {
            description: position.description,
            side: short ? t('roll.short') : t('roll.long'),
            count: Number(position.contracts),
          })}
        </Text>
        <Row gap={2} wrap>
          <Field label={t('common.date')} type="date" value={tradeDate} onChange={setTradeDate} />
          <Field
            label={t('roll.contractsToRoll')}
            value={quantity}
            onChange={setQuantity}
            hint={t('roll.openCount', { count: Number(position.contracts) })}
          />
        </Row>
        {choices.length > 0 && (
          <Select
            label={t('common.account')}
            value={accountId}
            onChange={setAccountId}
            options={[
              { value: '', label: t('roll.chooseAccount'), disabled: true },
              ...choices.map((a) => ({
                value: a.accountId,
                label: t('roll.accountOpen', { name: nameOf(a.accountId), count: Number(a.contracts) }),
              })),
            ]}
          />
        )}
        <Field
          label={short ? t('roll.buyBackAt') : t('roll.sellAt')}
          value={closePrice}
          onChange={setClosePrice}
          endText={t('roll.perShare', { currency: position.currency })}
          autoFocus
        />
        <Text variant="label">{t('roll.newContract')}</Text>
        <Row gap={2} wrap>
          <Field label={t('common.expiration')} type="date" value={expiration} onChange={setExpiration} />
          <Field label={t('common.strike')} value={strike} onChange={setStrike} />
          <Field
            label={t('common.type')}
            value={rightLabel(position.right)}
            onChange={() => {}}
            disabled
            hint={t('roll.typeHint')}
          />
        </Row>
        <Field
          label={short ? t('roll.sellNewAt') : t('roll.buyNewAt')}
          value={openPrice}
          onChange={setOpenPrice}
          endText={t('roll.perShare', { currency: position.currency })}
          hint={t('roll.feesHint')}
        />
        <Divider />
        <RollResult
          currency={position.currency}
          complete={complete}
          loading={preview.isFetching && !preview.data}
          preview={preview.data}
          problem={previewProblem}
        />
        {error && <Banner tone="error">{error}</Banner>}
        <Row gap={1} justify="end">
          <Button onClick={onClose} disabled={roll.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={roll.isPending}>
            {t('roll.roll')}
          </Button>
        </Row>
      </Col>
    </Dialog>
  );
}

function RollResult({
  currency,
  complete,
  loading,
  preview,
  problem,
}: {
  currency: string;
  complete: boolean;
  loading: boolean;
  preview: RollPreview | undefined;
  problem: string | null;
}) {
  const t = useT();
  const debit = preview?.netPremium.startsWith('-') ?? false;
  const amount = preview ? formatMoney(preview.netPremium.replace(/^-/, ''), currency) : '';
  const fees = preview
    ? { close: formatMoney(preview.fees[0], currency), open: formatMoney(preview.fees[1], currency) }
    : { close: '', open: '' };
  return (
    <Col gap={0.5}>
      <Text variant="label">{t('roll.result')}</Text>
      {problem ? (
        <Banner tone="warning">{problem}</Banner>
      ) : !complete ? (
        <Text muted>{t('roll.enterBoth')}</Text>
      ) : loading || !preview ? (
        <Text muted>{t('roll.calculating')}</Text>
      ) : (
        <>
          <Text variant="section" tone={debit ? 'negative' : 'positive'}>
            {debit ? t('roll.netDebit', { amount }) : t('roll.netCredit', { amount })}
          </Text>
          <Text variant="caption" muted>
            {debit ? t('roll.paidAfterFees', fees) : t('roll.receivedAfterFees', fees)}
          </Text>
        </>
      )}
    </Col>
  );
}
