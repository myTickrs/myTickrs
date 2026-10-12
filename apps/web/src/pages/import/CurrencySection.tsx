import type { ImportDraft, ReviewResponse, ReviewRow } from '@tickrs/shared';
import { Banner, Button, Card, Col, Field, Row, Select, Spinner, Text } from '@tickrs/ui';
import { useT } from '../../i18n.js';
import type { Account } from '../../lib/api.js';
import { ReviewGrid } from './ReviewGrid.js';

export function CurrencySection({
  currency,
  count,
  accounts,
  created,
  target,
  onTarget,
  onAddAccount,
  onEditAccount,
  review,
  openingDate,
  onOpeningDate,
  isChecked,
  onCheck,
  onEdit,
}: {
  currency: string;
  count: number;
  accounts: Account[];
  created: string | undefined;
  target: string;
  onTarget(accountId: string): void;
  onAddAccount(): void;
  onEditAccount(account: Account): void;
  review: ReviewResponse | undefined;
  openingDate: string;
  onOpeningDate(date: string): void;
  isChecked(row: ReviewRow): boolean;
  onCheck(rows: ReviewRow[], checked: boolean): void;
  onEdit(row: ReviewRow, draft: ImportDraft): void;
}) {
  const t = useT();
  const rows = review?.rows ?? [];
  const chosen = accounts.find((a) => a.id === target);
  return (
    <Card title={t('import.currencySection', { currency, count })}>
      <Col gap={3}>
        <Col gap={1}>
          <Row gap={1} align="center" wrap>
            <Col minWidth={240}>
              <Select
                label={t('import.intoAccount')}
                value={target}
                onChange={onTarget}
                disabled={accounts.length === 0}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </Col>
            {chosen && (
              <Button variant="text" onClick={() => onEditAccount(chosen)}>
                {t('import.editAccount')}
              </Button>
            )}
            <Button onClick={onAddAccount}>{t('import.addAccount', { currency })}</Button>
          </Row>
          {chosen && chosen.id === created && (
            <Banner tone="info">{t('import.noCurrencyAccount', { currency, name: chosen.name })}</Banner>
          )}
        </Col>

        {!review && <Spinner />}

        {review && (
          <Col gap={1}>
            <Text muted>{t('import.openingIntro')}</Text>
            {review.accountEmpty ? (
              <Col minWidth={200}>
                <Field
                  label={t('import.openingDate')}
                  type="date"
                  value={openingDate || review.openingDate}
                  onChange={onOpeningDate}
                />
              </Col>
            ) : (
              <Banner tone="warning">{t('import.accountNotEmpty')}</Banner>
            )}
            <ReviewGrid
              caption={t('import.holdingsTitle')}
              currency={currency}
              rows={rows}
              isChecked={isChecked}
              onCheck={onCheck}
              onEdit={onEdit}
            />
          </Col>
        )}
      </Col>
    </Card>
  );
}
