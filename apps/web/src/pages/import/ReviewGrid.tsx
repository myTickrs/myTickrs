import type { ImportDraft, ReviewRow } from '@tickrs/shared';
import { Badge, Button, Checkbox, Col, DataTable, Dialog, IconButton, Text, type Column } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../../i18n.js';
import { formatQuantity, formatSignedMoney, toneOf } from '../../lib/format.js';
import { EditRowDialog } from './EditRowDialog.js';
import { instrumentText, issueText, sourceText, statusTone } from './text.js';

export function ReviewGrid({
  caption,
  currency,
  rows,
  isChecked,
  onCheck,
  onEdit,
}: {
  caption: string;
  currency: string;
  rows: ReviewRow[];
  isChecked(row: ReviewRow): boolean;
  onCheck(rows: ReviewRow[], checked: boolean): void;
  onEdit(row: ReviewRow, draft: ImportDraft): void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState<ReviewRow[] | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);

  const tick = (targets: ReviewRow[], checked: boolean) => {
    const selectable = targets.filter((r) => r.selectable);
    if (checked && selectable.some((r) => r.duplicate && !isChecked(r))) setConfirming(selectable);
    else onCheck(selectable, checked);
  };

  const selectable = rows.filter((r) => r.selectable);
  const allChecked = selectable.length > 0 && selectable.every(isChecked);

  const columns: Column<ReviewRow>[] = [
    {
      key: 'check',
      header: t('import.selectAll'),
      headerCell: (
        <Checkbox
          hideLabel
          label={t('import.selectAll')}
          checked={allChecked}
          disabled={selectable.length === 0}
          onChange={(checked) => tick(selectable, checked)}
        />
      ),
      width: 40,
      render: (r) => (
        <Checkbox
          hideLabel
          label={t('import.rowCheckbox')}
          checked={isChecked(r)}
          disabled={!r.selectable}
          onChange={(checked) => tick([r], checked)}
        />
      ),
    },
    { key: 'instrument', header: t('import.instrument'), render: (r) => instrumentText(r.draft) },
    {
      key: 'quantity',
      header: t('common.qty'),
      align: 'right',
      render: (r) => (r.draft.quantity ? formatQuantity(r.draft.quantity) : '—'),
    },
    {
      key: 'price',
      header: t('import.field.averagePrice'),
      align: 'right',
      render: (r) => r.draft.price ?? '—',
    },
    {
      key: 'unrealized',
      header: t('import.field.unrealizedPnl'),
      align: 'right',
      render: (r) => pnl(r.draft.unrealizedPnl, currency),
    },
    {
      key: 'realized',
      header: t('import.field.realizedPnl'),
      align: 'right',
      render: (r) => pnl(r.draft.realizedPnl, currency),
    },
    {
      key: 'status',
      header: '',
      render: (r) => (
        <Col gap={0}>
          <Badge label={t(`import.status.${r.status}`)} tone={statusTone(r.status)} title={r.description} />
          {r.issues.map((issue) => (
            <Text key={issue.code} variant="caption" muted>
              {issueText(issue)}
            </Text>
          ))}
        </Col>
      ),
    },
    {
      key: 'source',
      header: t('import.from'),
      render: (r) => (
        <Text variant="caption" muted>
          {sourceText(r)}
        </Text>
      ),
    },
    {
      key: 'edit',
      header: '',
      width: 40,
      render: (r) => (
        <IconButton label={t('import.editRow')} onClick={() => setEditing(r)}>
          ✎
        </IconButton>
      ),
    },
  ];

  return (
    <Col gap={1}>
      <DataTable dense caption={caption} columns={columns} rows={rows} rowKey={(r) => r.id} />

      <Dialog
        open={confirming != null}
        title={t('import.duplicateTitle')}
        onClose={() => setConfirming(null)}
        actions={
          <>
            <Button onClick={() => setConfirming(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onCheck(confirming ?? [], true);
                setConfirming(null);
              }}
            >
              {t('import.duplicateConfirm')}
            </Button>
          </>
        }
      >
        <Text>{t('import.duplicateBody')}</Text>
      </Dialog>

      {editing && (
        <EditRowDialog
          draft={editing.draft}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            onEdit(editing, draft);
            setEditing(null);
          }}
        />
      )}
    </Col>
  );
}

function pnl(value: string | null, currency: string) {
  if (value == null) return '—';
  return <Text tone={toneOf(value)}>{formatSignedMoney(value, currency)}</Text>;
}
