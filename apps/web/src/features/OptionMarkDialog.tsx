import { Banner, Button, Col, Dialog, Field, Row, Text } from '@tickrs/ui';
import { useState } from 'react';
import { t as translate, useT } from '../i18n.js';
import { api, errorText, type OptionPosition } from '../lib/api.js';
import { formatMoney, toDecimalInput } from '../lib/format.js';
import { useLedgerMutation } from '../lib/queries.js';

const DECIMAL = /^\d+(\.\d+)?$/;

export function OptionMarkDialog({
  position,
  onClose,
}: {
  position: OptionPosition | null;
  onClose(): void;
}) {
  const t = useT();
  const [mark, setMark] = useState(position?.markSource === 'MANUAL' ? position.mark : '');
  const [error, setError] = useState<string | null>(null);

  const save = useLedgerMutation((value: string) =>
    api.put(`/options/contracts/${position!.contractId}/mark`, { mark: value }),
  );
  const clear = useLedgerMutation(() => api.delete(`/options/contracts/${position!.contractId}/mark`));

  if (!position) return null;
  const busy = save.isPending || clear.isPending;
  const failed = (e: unknown) => setError(errorText(e, t('markDialog.failed')));

  const submit = () => {
    const value = toDecimalInput(mark);
    if (!DECIMAL.test(value)) {
      setError(t('markDialog.invalid'));
      return;
    }
    setError(null);
    save.mutate(value, { onSuccess: onClose, onError: failed });
  };

  return (
    <Dialog open title={t('markDialog.title')} onClose={onClose} onSubmit={submit}>
      <Col gap={2}>
        <Text muted>{position.description}</Text>
        <Text>
          {position.markSource
            ? t('markDialog.nowValuedFrom', {
                price: formatMoney(position.mark, position.currency),
                source: sourceLabel(position.markSource),
              })
            : t('markDialog.nowValued', { price: formatMoney(position.mark, position.currency) })}
        </Text>
        <Field
          label={t('markDialog.pricePerShare')}
          value={mark}
          onChange={(v) => {
            setMark(v);
            setError(null);
          }}
          autoFocus
          endText={position.currency}
          hint={t('markDialog.hint')}
        />
        {error && <Banner tone="error">{error}</Banner>}
        <Row gap={1} justify="between" wrap>
          {position.markSource === 'MANUAL' ? (
            <Button
              tone="danger"
              variant="text"
              disabled={busy}
              onClick={() => clear.mutate(undefined, { onSuccess: onClose, onError: failed })}
            >
              {t('markDialog.clear')}
            </Button>
          ) : (
            <span />
          )}
          <Row gap={1}>
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </Row>
        </Row>
      </Col>
    </Dialog>
  );
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'QUOTE':
    case 'MANUAL':
    case 'TRADE':
    case 'INTRINSIC_FLOOR':
      return translate(`markDialog.source${source}`);
    default:
      return source.toLowerCase();
  }
}
