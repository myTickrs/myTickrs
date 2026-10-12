import { Col, Text } from '@tickrs/ui';
import { formatPercent, formatSignedMoney, toneOf } from '../lib/format.js';

export function DayChange({
  change,
  currency,
}: {
  change: { amount: string; percent: string | null };
  currency: string;
}) {
  const tone = toneOf(change.amount);
  return (
    <Col gap={0} align="end">
      <Text inline tone={tone}>
        {formatSignedMoney(change.amount, currency)}
      </Text>
      {change.percent != null && (
        <Text variant="caption" tone={tone}>
          {formatPercent(change.percent)}
        </Text>
      )}
    </Col>
  );
}
