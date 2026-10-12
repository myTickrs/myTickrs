import { useState } from 'react';
import type { ResolveNeedsActionRequest } from '@tickrs/shared';
import { Button, Card, Col, DataTable, Field, Row, Text, type Column } from '@tickrs/ui';
import { useT } from '../../i18n.js';
import { errorText, type NeedsActionItem } from '../../lib/api.js';
import { formatDate, formatMoney, toDecimalInput, typeLabel } from '../../lib/format.js';
import { resolveNeedsAction, useLedgerMutation } from '../../lib/queries.js';

export function NeedsActionCard({
  items,
  onError,
}: {
  items: NeedsActionItem[];
  onError(message: string | null): void;
}) {
  const t = useT();
  const [settlements, setSettlements] = useState<Record<string, string>>({});
  const resolve = useLedgerMutation((item: ResolveNeedsActionRequest['items'][number]) =>
    resolveNeedsAction([item]),
  );

  const columns: Column<NeedsActionItem>[] = [
    { key: 'description', header: t('options.contract'), render: (i) => i.description },
    { key: 'expiration', header: t('options.expired'), render: (i) => formatDate(i.expiration) },
    {
      key: 'side',
      header: t('options.position'),
      render: (i) => `${i.side === 'SHORT' ? '−' : '+'}${i.contracts}`,
    },
    {
      key: 'close',
      header: t('options.underlyingClose'),
      align: 'right',
      render: (i) =>
        i.settlement === 'CASH' ? (
          <Field
            label={t('options.settlementPrice')}
            value={settlements[i.contractId] ?? ''}
            onChange={(v) => setSettlements((s) => ({ ...s, [i.contractId]: v }))}
            placeholder={i.underlyingClose ?? ''}
          />
        ) : (
          formatMoney(i.underlyingClose)
        ),
    },
    { key: 'moneyness', header: t('options.moneyness'), render: (i) => i.moneyness ?? t('options.unknown') },
    {
      key: 'actions',
      header: t('options.resolveAs'),
      align: 'right',
      render: (i) => (
        <Row gap={1} justify="end">
          {(['EXP', i.side === 'SHORT' ? 'ASN' : 'EXR'] as const).map((outcome) => (
            <Button
              key={outcome}
              variant={i.suggestedOutcome === outcome ? 'primary' : 'secondary'}
              disabled={!i.accountId || resolve.isPending}
              onClick={() => {
                onError(null);
                const price = settlements[i.contractId]?.trim();
                resolve.mutate(
                  {
                    contractId: i.contractId,
                    accountId: i.accountId!,
                    outcome,
                    ...(outcome !== 'EXP' && i.settlement === 'CASH' && price
                      ? { price: toDecimalInput(price) }
                      : {}),
                  },
                  {
                    onError: (e: unknown) => onError(errorText(e, t('options.resolveFailed'))),
                  },
                );
              }}
            >
              {typeLabel(outcome)}
            </Button>
          ))}
        </Row>
      ),
    },
  ];

  return (
    <Card title={t('options.needsActionTitle')}>
      <Col gap={1}>
        <Text muted>{t('options.needsActionText')}</Text>
        <DataTable
          caption={t('options.needsActionCaption')}
          columns={columns}
          rows={items}
          rowKey={(i) => i.contractId}
        />
      </Col>
    </Card>
  );
}
