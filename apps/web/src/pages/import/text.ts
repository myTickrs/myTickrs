import type { ImportDraft, ImportIssue, ReviewRow } from '@tickrs/shared';
import { t } from '../../i18n.js';
import { serverWording } from '../../lib/api.js';
import { formatDate, rightLabel } from '../../lib/format.js';

const param = (issue: ImportIssue, key: string) => String(issue.params?.[key] ?? '');

export function issueText(issue: ImportIssue): string {
  switch (issue.code) {
    case 'DUPLICATE_IMPORT':
      return t('import.issue.DUPLICATE_IMPORT', { file: param(issue, 'file') });
    case 'LOW_CONFIDENCE':
      return issue.params?.note
        ? serverWording(
            t('import.issue.LOW_CONFIDENCE_NOTE', { note: param(issue, 'note') }),
            t('import.issue.LOW_CONFIDENCE'),
          )
        : t('import.issue.LOW_CONFIDENCE');
    case 'INVALID':
      return serverWording(issue.message, t('import.issue.INVALID'));
    case 'RECORD_NOT_READ':
      return t('import.issue.RECORD_NOT_READ', { record: param(issue, 'record') });
    case 'PRICE_FROM_PNL':
      return t('import.issue.PRICE_FROM_PNL', { price: param(issue, 'price') });
    default:
      return t(`import.issue.${issue.code}`);
  }
}

export const isOption = (d: ImportDraft) => Boolean(d.expiration || d.strike || d.right);

export function instrumentText(d: ImportDraft): string {
  if (!isOption(d)) return d.symbol ?? '—';
  return [
    d.symbol,
    d.expiration ? formatDate(d.expiration) : null,
    d.strike,
    d.right ? rightLabel(d.right) : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function sourceText(row: ReviewRow): string {
  return row.source.record
    ? t('import.fromRecord', { file: row.source.file, record: row.source.record })
    : row.source.file;
}

export const statusTone = (status: ReviewRow['status']) =>
  status === 'OK'
    ? 'positive'
    : status === 'DUPLICATE' || status === 'REVIEW'
      ? 'warning'
      : status === 'INVALID'
        ? 'negative'
        : 'default';
