import { OPTION_RIGHTS, type ImportDraft } from '@tickrs/shared';
import { Button, Checkbox, Col, Dialog, Field, Row, Select } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../../i18n.js';
import { rightLabel, toDecimalInput } from '../../lib/format.js';
import { isOption } from './text.js';

export function EditRowDialog({
  draft,
  onSave,
  onClose,
}: {
  draft: ImportDraft;
  onSave(draft: ImportDraft): void;
  onClose(): void;
}) {
  const t = useT();
  const [form, setForm] = useState<ImportDraft>(draft);
  const [option, setOption] = useState(isOption(draft));
  const set = <K extends keyof ImportDraft>(key: K, value: ImportDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof ImportDraft) => (value: string) => set(key, value.trim() === '' ? null : value);
  const number = (key: keyof ImportDraft) => (value: string) => {
    const clean = toDecimalInput(value);
    set(key, clean === '' ? null : clean);
  };
  const save = () => onSave(option ? form : { ...form, expiration: null, strike: null, right: null });

  return (
    <Dialog
      open
      title={t('import.editRow')}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Col gap={2}>
        <Row gap={2} responsive align="center">
          <Field
            label={option ? t('import.field.underlying') : t('import.field.symbol')}
            value={form.symbol ?? ''}
            onChange={(v) => set('symbol', v.trim().toUpperCase() || null)}
          />
          <Checkbox label={t('import.isOption')} checked={option} onChange={setOption} />
        </Row>
        {option && (
          <Row gap={2} responsive>
            <Field
              label={t('common.expiration')}
              type="date"
              value={form.expiration ?? ''}
              onChange={text('expiration')}
            />
            <Field label={t('common.strike')} value={form.strike ?? ''} onChange={number('strike')} />
            <Select<string>
              label={t('import.field.right')}
              value={form.right ?? ''}
              onChange={(v) => set('right', (v || null) as ImportDraft['right'])}
              options={[
                { value: '', label: t('import.chooseRight') },
                ...OPTION_RIGHTS.map((r) => ({ value: r, label: rightLabel(r) })),
              ]}
            />
          </Row>
        )}
        <Row gap={2} responsive>
          <Field
            label={t('common.quantity')}
            hint={t('import.quantityHint')}
            value={form.quantity ?? ''}
            onChange={number('quantity')}
          />
          <Field label={t('import.field.averagePrice')} value={form.price ?? ''} onChange={number('price')} />
        </Row>
        <Field
          label={t('import.field.realizedPnl')}
          hint={t('import.realizedHint')}
          value={form.realizedPnl ?? ''}
          onChange={number('realizedPnl')}
        />
      </Col>
    </Dialog>
  );
}
