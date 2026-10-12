import CheckIcon from '@mui/icons-material/Check';
import MuiBox from '@mui/material/Box';
import MuiCard from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogActions from '@mui/material/DialogActions';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiStack from '@mui/material/Stack';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import MuiTypography from '@mui/material/Typography';
import type { FormEvent, ReactNode } from 'react';
import { TONE_COLOR, type Tone } from './tone.js';

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MuiCard variant="outlined">
      <MuiCardContent>
        {(title || action) && (
          <MuiStack direction="row" sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
            {title && <MuiTypography variant="subtitle1">{title}</MuiTypography>}
            {action}
          </MuiStack>
        )}
        {children}
      </MuiCardContent>
    </MuiCard>
  );
}

export function StepCard({
  step,
  title,
  done,
  upcoming,
  action,
  children,
}: {
  step: number;
  title: string;
  done?: boolean;
  upcoming?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MuiCard variant="outlined" component="section" aria-label={`${step}. ${title}`}>
      <MuiCardContent>
        <MuiStack direction="row" sx={{ mb: 1.5, gap: 1.5, alignItems: 'center' }}>
          <MuiBox
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              flex: 'none',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.875rem',
              fontWeight: 600,
              bgcolor: done ? 'success.main' : upcoming ? 'action.disabledBackground' : 'primary.main',
              color: done ? 'success.contrastText' : upcoming ? 'text.secondary' : 'primary.contrastText',
            }}
          >
            {done ? <CheckIcon sx={{ fontSize: 18 }} /> : step}
          </MuiBox>
          <MuiTypography variant="subtitle1" sx={{ flex: 1, color: upcoming ? 'text.secondary' : undefined }}>
            {title}
          </MuiTypography>
          {action}
        </MuiStack>
        {children}
      </MuiCardContent>
    </MuiCard>
  );
}

export function StatTile({
  label,
  value,
  tone = 'default',
  sub,
  action,
}: {
  label: string;
  value: string;
  tone?: Tone;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <MuiCard variant="outlined" sx={{ minWidth: 180, flex: 1, alignSelf: 'stretch' }}>
      <MuiCardContent>
        <MuiStack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <MuiTypography variant="body2" color="text.secondary">
            {label}
          </MuiTypography>
          {action}
        </MuiStack>
        <MuiTypography variant="h6" sx={{ color: TONE_COLOR[tone], mt: 0.5 }}>
          {value}
        </MuiTypography>
        {sub && (
          <MuiTypography variant="caption" color="text.secondary">
            {sub}
          </MuiTypography>
        )}
      </MuiCardContent>
    </MuiCard>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
  onSubmit,
  maxWidth = 'sm',
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
  onSubmit?(): void;
  maxWidth?: 'xs' | 'sm' | 'md';
}) {
  const content = (
    <>
      <MuiDialogTitle>{title}</MuiDialogTitle>
      <MuiDialogContent sx={{ '&&': { pt: 1 } }}>{children}</MuiDialogContent>
      {actions && <MuiDialogActions>{actions}</MuiDialogActions>}
    </>
  );
  return (
    <MuiDialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      {onSubmit ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </MuiDialog>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange(value: T): void;
  tabs: readonly { value: T; label: string }[];
}) {
  return (
    <MuiTabs
      value={value}
      onChange={(_e, v: T) => onChange(v)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{ mb: 2 }}
    >
      {tabs.map((t) => (
        <MuiTab key={t.value} value={t.value} label={t.label} />
      ))}
    </MuiTabs>
  );
}
