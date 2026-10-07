import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import MuiAlert from '@mui/material/Alert';
import MuiAutocomplete from '@mui/material/Autocomplete';
import MuiBox from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import MuiCard from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import MuiCheckbox from '@mui/material/Checkbox';
import MuiChip from '@mui/material/Chip';
import MuiCircularProgress from '@mui/material/CircularProgress';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogActions from '@mui/material/DialogActions';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDivider from '@mui/material/Divider';
import MuiIconButton from '@mui/material/IconButton';
import MuiListItemIcon from '@mui/material/ListItemIcon';
import MuiListItemText from '@mui/material/ListItemText';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiStack from '@mui/material/Stack';
import MuiSwitch from '@mui/material/Switch';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import MuiTextField from '@mui/material/TextField';
import MuiFormControlLabel from '@mui/material/FormControlLabel';
import MuiToggleButton from '@mui/material/ToggleButton';
import MuiToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import MuiTooltip from '@mui/material/Tooltip';
import MuiTypography from '@mui/material/Typography';
import { useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useT } from './messages.js';

export type Tone = 'default' | 'positive' | 'negative' | 'warning' | 'info' | 'secondary';

const TONE_COLOR = {
  default: 'text.primary',
  positive: 'success.main',
  negative: 'error.main',
  warning: 'warning.main',
  info: 'info.main',
  secondary: 'secondary.main',
} as const;

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'text';
  tone?: 'default' | 'positive' | 'danger';
  disabled?: boolean;
  fullWidth?: boolean;
  startIcon?: ReactNode;
  'data-testid'?: string;
  'aria-label'?: string;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  tone = 'default',
  disabled,
  fullWidth,
  startIcon,
  ...rest
}: ButtonProps) {
  return (
    <MuiButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      fullWidth={fullWidth}
      startIcon={startIcon}
      color={tone === 'danger' ? 'error' : tone === 'positive' ? 'success' : 'primary'}
      variant={variant === 'primary' ? 'contained' : variant === 'text' ? 'text' : 'outlined'}
      data-testid={rest['data-testid']}
      aria-label={rest['aria-label']}
    >
      {children}
    </MuiButton>
  );
}

export function FilePicker({
  label,
  accept = '.csv,text/csv',
  disabled,
  maxBytes,
  onFile,
  onTooLarge,
  testId = 'file-input',
}: {
  label: string;
  accept?: string;
  disabled?: boolean;
  maxBytes?: number;
  onFile(file: { name: string; text: string }): void;
  onTooLarge?(size: number): void;
  testId?: string;
}) {
  return (
    <MuiButton component="label" variant="outlined" size="small" disabled={disabled}>
      {label}
      <input
        type="file"
        accept={accept}
        hidden
        data-testid={testId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (maxBytes != null && file.size > maxBytes) {
            onTooLarge?.(file.size);
            return;
          }
          void file.text().then((text) => onFile({ name: file.name, text }));
        }}
      />
    </MuiButton>
  );
}

export interface PickedFile {
  name: string;
  mediaType: string;
  size: number;
  blob: Blob;
}

export function FileDrop({
  label,
  hint,
  accept,
  multiple = true,
  disabled,
  onFiles,
  testId = 'file-drop',
}: {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles(files: PickedFile[]): void;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  const hand = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])].map((f) => ({ name: f.name, mediaType: f.type, size: f.size, blob: f }));
    if (files.length > 0) onFiles(files);
  };
  return (
    <MuiBox
      component="label"
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) hand(e.dataTransfer?.files);
      }}
      sx={{
        display: 'block',
        border: 2,
        borderStyle: 'dashed',
        borderColor: over ? 'primary.main' : 'divider',
        borderRadius: 2,
        p: 3,
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        bgcolor: over ? 'action.hover' : 'transparent',
      }}
    >
      <MuiTypography variant="subtitle1">{label}</MuiTypography>
      {hint && (
        <MuiTypography variant="body2" color="text.secondary">
          {hint}
        </MuiTypography>
      )}
      <input
        type="file"
        multiple={multiple}
        hidden
        accept={accept}
        disabled={disabled}
        data-testid={testId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          hand(e.target.files);
          e.target.value = '';
        }}
      />
    </MuiBox>
  );
}

export function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <MuiIconButton aria-label={label} title={label} onClick={onClick} size="small">
      {children}
    </MuiIconButton>
  );
}

export const MENU_ICONS = {
  groupBy: ViewAgendaIcon,
} as const;
export type MenuIcon = keyof typeof MENU_ICONS;

interface ChoiceMenuProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}

function ChoiceMenu<T extends string>({
  anchor,
  onClose,
  value,
  options,
  onChange,
}: ChoiceMenuProps<T> & { anchor: HTMLElement | null; onClose(): void }) {
  return (
    <MuiMenu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      {options.map((o) => (
        <MuiMenuItem
          key={o.value}
          selected={o.value === value}
          onClick={() => {
            onClose();
            if (o.value !== value) onChange(o.value);
          }}
        >
          <MuiListItemIcon>{o.value === value && <CheckIcon fontSize="small" />}</MuiListItemIcon>
          <MuiListItemText>{o.label}</MuiListItemText>
        </MuiMenuItem>
      ))}
    </MuiMenu>
  );
}

export function IconMenu<T extends string>({
  label,
  icon,
  ...menu
}: ChoiceMenuProps<T> & { label: string; icon: MenuIcon }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const Icon = MENU_ICONS[icon];
  return (
    <>
      <MuiIconButton
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        size="small"
      >
        <Icon fontSize="small" />
      </MuiIconButton>
      <ChoiceMenu anchor={anchor} onClose={() => setAnchor(null)} {...menu} />
    </>
  );
}

export function MenuSelect<T extends string>({ label, ...menu }: ChoiceMenuProps<T> & { label: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = menu.options.find((o) => o.value === menu.value);
  return (
    <>
      <MuiButton
        size="small"
        color="inherit"
        aria-label={`${label}: ${current?.label ?? ''}`}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ArrowDropDownIcon />}
        sx={{ textTransform: 'none', color: 'text.secondary', py: 0, minWidth: 0 }}
      >
        {current?.label}
      </MuiButton>
      <ChoiceMenu anchor={anchor} onClose={() => setAnchor(null)} {...menu} />
    </>
  );
}

export interface FieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  error?: string;
  hint?: string;
  tooltip?: string;
  required?: boolean;
  requiredMessage?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  endText?: string;
  name?: string;
  rows?: number;
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  tooltip,
  endText,
  rows,
  requiredMessage,
  ...rest
}: FieldProps) {
  const field = (
    <MuiTextField
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      type={type}
      size="small"
      fullWidth
      multiline={rows != null}
      minRows={rows}
      error={Boolean(error)}
      helperText={error ?? hint}
      required={rest.required}
      disabled={rest.disabled}
      autoFocus={rest.autoFocus}
      placeholder={rest.placeholder}
      name={rest.name}
      slotProps={{
        inputLabel: type === 'date' ? { shrink: true } : undefined,
        input: endText
          ? { endAdornment: <MuiTypography variant="body2">{endText}</MuiTypography> }
          : undefined,
        htmlInput: requiredMessage
          ? {
              onInvalid: (e: FormEvent<HTMLInputElement>) =>
                e.currentTarget.setCustomValidity(
                  e.currentTarget.validity.valueMissing ? requiredMessage : '',
                ),
              onInput: (e: FormEvent<HTMLInputElement>) => e.currentTarget.setCustomValidity(''),
            }
          : undefined,
      }}
    />
  );
  return tooltip != null ? (
    <MuiTooltip title={tooltip} arrow placement="top">
      {field}
    </MuiTooltip>
  ) : (
    field
  );
}

export interface Suggestion {
  value: string;
  label: string;
  detail?: string;
}

export interface AutocompleteFieldProps<S extends Suggestion> extends Omit<FieldProps, 'type' | 'endText'> {
  suggestions: S[];
  onPick?(suggestion: S): void;
  loading?: boolean;
}

export function AutocompleteField<S extends Suggestion>({
  label,
  value,
  onChange,
  suggestions,
  onPick,
  loading,
  error,
  hint,
  ...rest
}: AutocompleteFieldProps<S>) {
  return (
    <MuiAutocomplete<S | string, false, false, true>
      freeSolo
      fullWidth
      size="small"
      options={suggestions}
      inputValue={value}
      onInputChange={(_event, text, reason) => {
        if (reason !== 'reset') onChange(text);
      }}
      onChange={(_event, picked) => {
        if (picked && typeof picked !== 'string') {
          onChange(picked.value);
          onPick?.(picked);
        }
      }}
      filterOptions={(options) => options}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.value)}
      isOptionEqualToValue={(option, other) =>
        typeof option !== 'string' && typeof other !== 'string' && option.value === other.value
      }
      loading={loading}
      disabled={rest.disabled}
      renderOption={({ key, ...props }, option) =>
        typeof option === 'string' ? null : (
          <li key={key} {...props}>
            <MuiStack>
              <MuiTypography variant="body2">{option.label}</MuiTypography>
              {option.detail && (
                <MuiTypography variant="caption" color="text.secondary">
                  {option.detail}
                </MuiTypography>
              )}
            </MuiStack>
          </li>
        )
      }
      renderInput={(params) => (
        <MuiTextField
          {...params}
          label={label}
          error={Boolean(error)}
          helperText={error ?? hint}
          required={rest.required}
          autoFocus={rest.autoFocus}
          placeholder={rest.placeholder}
          name={rest.name}
        />
      )}
    />
  );
}

export interface SelectProps<T extends string> {
  label: string;
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string; disabled?: boolean }[];
  disabled?: boolean;
  hint?: string;
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
  hint,
}: SelectProps<T>) {
  return (
    <MuiTextField
      select
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value as T)}
      size="small"
      fullWidth
      disabled={disabled}
      helperText={hint}
    >
      {options.map((o) => (
        <MuiMenuItem key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </MuiMenuItem>
      ))}
    </MuiTextField>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <MuiFormControlLabel
      control={<MuiSwitch checked={checked} onChange={(_e, v) => onChange(v)} />}
      label={label}
    />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  hideLabel,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  if (hideLabel) {
    return (
      <MuiCheckbox
        size="small"
        checked={checked}
        disabled={disabled}
        onChange={(_e, v) => onChange(v)}
        slotProps={{ input: { 'aria-label': label } }}
        sx={{ p: 0.5 }}
      />
    );
  }
  return (
    <MuiFormControlLabel
      control={<MuiCheckbox size="small" checked={checked} onChange={(_e, v) => onChange(v)} />}
      label={label}
      disabled={disabled}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <MuiToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label={label}
      onChange={(_e, v: T | null) => v && onChange(v)}
    >
      {options.map((o) => (
        <MuiToggleButton key={o.value} value={o.value}>
          {o.label}
        </MuiToggleButton>
      ))}
    </MuiToggleButtonGroup>
  );
}

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

export type Align = 'start' | 'center' | 'end' | 'baseline';
export type Justify = 'start' | 'center' | 'end' | 'between';

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', baseline: 'baseline' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

export interface LayoutProps {
  children: ReactNode;
  gap?: number;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  responsive?: boolean;
  grow?: boolean;
  minWidth?: number;
}

export function Row({
  children,
  gap = 2,
  align = 'center',
  justify = 'start',
  wrap,
  responsive,
  grow,
  minWidth,
}: LayoutProps) {
  return (
    <MuiStack
      direction={responsive ? { xs: 'column', sm: 'row' } : 'row'}
      spacing={gap}
      useFlexGap={wrap}
      sx={{
        alignItems: ALIGN[align],
        justifyContent: JUSTIFY[justify],
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...(grow ? { flexGrow: 1 } : {}),
        ...(minWidth ? { minWidth } : {}),
      }}
    >
      {children}
    </MuiStack>
  );
}

export function Col({ children, gap = 2, align, grow, minWidth }: LayoutProps) {
  return (
    <MuiStack
      direction="column"
      spacing={gap}
      sx={{
        ...(align ? { alignItems: ALIGN[align] } : {}),
        ...(grow ? { flexGrow: 1 } : {}),
        ...(minWidth ? { minWidth } : {}),
      }}
    >
      {children}
    </MuiStack>
  );
}

export type TextVariant = 'title' | 'section' | 'label' | 'body' | 'caption';

// i18n-ignore: Material UI variant names, not text
const TEXT_VARIANT = {
  title: 'h5',
  section: 'subtitle1',
  label: 'subtitle2',
  body: 'body2',
  caption: 'caption',
} as const;

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  muted,
  inline,
}: {
  children: ReactNode;
  variant?: TextVariant;
  tone?: Tone;
  muted?: boolean;
  inline?: boolean;
}) {
  const sx = { color: muted ? 'text.secondary' : TONE_COLOR[tone] };
  return inline ? (
    <MuiTypography variant={TEXT_VARIANT[variant]} component="span" sx={sx}>
      {children}
    </MuiTypography>
  ) : (
    <MuiTypography variant={TEXT_VARIANT[variant]} sx={sx}>
      {children}
    </MuiTypography>
  );
}

export const Divider = MuiDivider;

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
