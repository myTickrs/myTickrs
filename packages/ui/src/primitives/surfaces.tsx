import CheckIcon from '@mui/icons-material/Check';
import MenuIcon from '@mui/icons-material/Menu';
import MuiBox from '@mui/material/Box';
import MuiCard from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogActions from '@mui/material/DialogActions';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiIconButton from '@mui/material/IconButton';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiStack from '@mui/material/Stack';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import MuiTypography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useT } from '../messages.js';
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

export type StatLine = string | { label: string; value: string; tone?: Tone };

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
  sub?: StatLine | readonly StatLine[];
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
        {(Array.isArray(sub) ? sub : sub ? [sub] : []).map((line: StatLine, i) =>
          typeof line === 'string' ? (
            <MuiTypography key={i} variant="caption" color="text.secondary" component="div">
              {line}
            </MuiTypography>
          ) : (
            <MuiTypography key={i} variant="caption" color="text.secondary" component="div">
              {line.label}{' '}
              <MuiTypography
                variant="caption"
                component="span"
                sx={{ color: TONE_COLOR[line.tone ?? 'default'] }}
              >
                {line.value}
              </MuiTypography>
            </MuiTypography>
          ),
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
  menuOnPhone,
}: {
  value: T;
  onChange(value: T): void;
  tabs: readonly { value: T; label: string }[];
  menuOnPhone?: boolean;
}) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  if (menuOnPhone && phone) return <TabsMenu value={value} onChange={onChange} tabs={tabs} />;
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

function TabsMenu<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange(value: T): void;
  tabs: readonly { value: T; label: string }[];
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const label = t('shell.menu');

  return (
    <MuiStack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
      <MuiIconButton
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MenuIcon />
      </MuiIconButton>
      <MuiTypography variant="subtitle1">{tabs.find((tab) => tab.value === value)?.label}</MuiTypography>
      <MuiMenu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {tabs.map((tab) => (
          <MuiMenuItem
            key={tab.value}
            selected={tab.value === value}
            onClick={() => {
              setAnchor(null);
              if (tab.value !== value) onChange(tab.value);
            }}
          >
            {tab.label}
          </MuiMenuItem>
        ))}
      </MuiMenu>
    </MuiStack>
  );
}
