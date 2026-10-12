import {
  DATE_FORMATS,
  IMPORT_AI_MAX_RECORDS,
  MAPPING_FIELDS,
  isCompleteMapping,
  type DateFormat,
  type ExtractResponse,
  type Mapping,
  type MappingField,
} from '@tickrs/shared';
import { Banner, Button, Card, Checkbox, Col, DataTable, Row, Select, Text } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../../i18n.js';

export function MappingStep({
  response,
  busy,
  aiFiles,
  onConfirm,
  onReadWithAi,
}: {
  response: ExtractResponse;
  busy: boolean;
  aiFiles?: { left: number | null; limit: number | null };
  onConfirm(mapping: Mapping, remember: boolean): void;
  onReadWithAi(): void;
}) {
  const t = useT();
  const [mapping, setMapping] = useState<Mapping>(response.mapping!);
  const [remember, setRemember] = useState(true);
  const columns = response.sample?.columns ?? [];
  const records = (response.sample?.records ?? []).slice(0, 5);
  const complete = isCompleteMapping(mapping.fields);
  const tooLong = (response.recordCount ?? 0) > IMPORT_AI_MAX_RECORDS;

  const setField = (field: MappingField, column: string) =>
    setMapping((m) => {
      const fields = { ...m.fields };
      if (column) fields[field] = column;
      else delete fields[field];
      return { ...m, fields };
    });

  return (
    <Card title={t('import.mappingTitle', { file: response.file })}>
      <Col gap={2}>
        <Text muted>
          {t('import.mappingIntro')}{' '}
          {response.mappingSource === 'ai' ? t('import.mappingFromAi') : t('import.mappingFromGuess')}
        </Text>
        <Row gap={2} wrap>
          {MAPPING_FIELDS.map((field) => (
            <Col key={field} minWidth={180}>
              <Select
                label={t(`import.field.${field}`)}
                value={mapping.fields[field] ?? ''}
                onChange={(column) => setField(field, column)}
                options={[
                  { value: '', label: t('import.notInFile') },
                  ...columns.map((c) => ({ value: c, label: c })),
                ]}
              />
            </Col>
          ))}
          {mapping.fields.expiration && (
            <Col minWidth={180}>
              <Select<DateFormat>
                label={t('import.expirationsWritten')}
                value={mapping.dateFormat}
                onChange={(dateFormat) => setMapping((m) => ({ ...m, dateFormat }))}
                options={DATE_FORMATS.map((f) => ({ value: f, label: t(`import.dateFormat.${f}`) }))}
              />
            </Col>
          )}
        </Row>

        {records.length > 0 && (
          <DataTable<Record<string, string>>
            dense
            caption={t('import.sampleTitle')}
            columns={columns
              .slice(0, 12)
              .map((c) => ({ key: c, header: c, nowrap: true, render: (r) => r[c] ?? '' }))}
            rows={records}
            rowKey={(r) => String(records.indexOf(r))}
          />
        )}

        {aiFiles && (
          <Banner
            tone={complete ? 'info' : 'warning'}
            action={
              <Button
                disabled={busy || tooLong || aiFiles.left === 0}
                onClick={onReadWithAi}
                data-testid="read-with-ai"
              >
                {t('import.readWithAi')}
              </Button>
            }
          >
            {[
              complete ? t('import.readWithAiIntro') : t('import.readWithAiNeeded'),
              tooLong
                ? t('import.readWithAiTooLong', { max: IMPORT_AI_MAX_RECORDS })
                : aiFiles.limit == null
                  ? t('import.readWithAiCostUnlimited')
                  : t('import.readWithAiCost', { left: aiFiles.left, limit: aiFiles.limit }),
            ].join(' ')}
          </Banner>
        )}

        <Row gap={2} justify="between" wrap align="center">
          <Checkbox label={t('import.rememberColumns')} checked={remember} onChange={setRemember} />
          <Button variant="primary" disabled={busy} onClick={() => onConfirm(mapping, remember)}>
            {t('import.readFile')}
          </Button>
        </Row>
      </Col>
    </Card>
  );
}
