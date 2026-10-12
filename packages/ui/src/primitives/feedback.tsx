import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MuiAlert from '@mui/material/Alert';
import MuiChip from '@mui/material/Chip';
import MuiCircularProgress from '@mui/material/CircularProgress';
import MuiIconButton from '@mui/material/IconButton';
import MuiStack from '@mui/material/Stack';
import MuiTooltip from '@mui/material/Tooltip';
import MuiTypography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useT } from '../messages.js';
import type { Tone } from './tone.js';

export function StatusIcon({
  ok,
  manual,
  label,
  onClick,
}: {
  ok: boolean;
  manual?: boolean;
  label: string;
  onClick?: () => void;
}) {
  const icon = manual ? (
    <PersonOutlinedIcon color="action" fontSize="small" />
  ) : ok ? (
    <CheckCircleIcon color="success" fontSize="small" />
  ) : (
    <WarningAmberIcon color="warning" fontSize="small" />
  );
  return (
    <MuiTooltip title={label} arrow>
      {onClick ? (
        <MuiIconButton aria-label={label} onClick={onClick} size="small">
          {icon}
        </MuiIconButton>
      ) : (
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          style={{ display: 'inline-flex', cursor: 'help', lineHeight: 0 }}
        >
          {icon}
        </span>
      )}
    </MuiTooltip>
  );
}

const BADGE_COLOR = {
  default: 'default',
  positive: 'success',
  negative: 'error',
  warning: 'warning',
  info: 'info',
  secondary: 'secondary',
} as const;

export function Badge({ label, tone = 'default', title }: { label: string; tone?: Tone; title?: string }) {
  const color = BADGE_COLOR[tone];
  return <MuiChip size="small" label={label} color={color} title={title} variant="outlined" />;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  onClose,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onClose?(): void;
}) {
  const t = useT();
  return (
    <MuiAlert
      severity={tone}
      action={action}
      onClose={onClose}
      closeText={t('common.close')}
      variant="outlined"
    >
      {title && <strong>{title} </strong>}
      {children}
    </MuiAlert>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  label ??= t('common.loading');
  return (
    <MuiStack direction="row" spacing={1} sx={{ py: 2, alignItems: 'center' }}>
      <MuiCircularProgress size={18} aria-label={label} />
      <MuiTypography variant="body2" color="text.secondary">
        {label}
      </MuiTypography>
    </MuiStack>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <MuiStack spacing={1} sx={{ py: 4, textAlign: 'center' }}>
      <MuiTypography variant="subtitle1">{title}</MuiTypography>
      {children && (
        <MuiTypography variant="body2" color="text.secondary">
          {children}
        </MuiTypography>
      )}
    </MuiStack>
  );
}
