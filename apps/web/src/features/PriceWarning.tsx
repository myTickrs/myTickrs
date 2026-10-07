import { StatusIcon } from '@tickrs/ui';
import { useT } from '../i18n.js';
import { formatDate } from '../lib/format.js';
import { sourceLabel } from './OptionMarkDialog.js';

export function PriceWarning({ asOf, source }: { asOf: string | null; source?: string | null }) {
  const t = useT();
  const parts: string[] = [];
  if (asOf) parts.push(t('common.priceFrom', { date: formatDate(asOf) }));
  if (source) parts.push(t('options.estimatedFrom', { source: sourceLabel(source) }));
  if (parts.length === 0) parts.push(t('common.priceMissing'));
  return <StatusIcon ok={false} label={parts.join(' · ')} />;
}

export function MarkWarning({ mark }: { mark: { markAsOf: string | null; markSource: string | null } }) {
  const t = useT();
  if (mark.markSource === 'MANUAL') return <StatusIcon ok={false} manual label={t('options.manualPrice')} />;
  const intrinsic = mark.markSource?.startsWith('INTRINSIC');
  return <PriceWarning asOf={intrinsic ? null : mark.markAsOf} source={mark.markSource} />;
}
