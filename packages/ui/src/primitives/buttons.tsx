import MuiButton from '@mui/material/Button';
import MuiIconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import type { ReactNode } from 'react';

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

export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <MuiLink
      component="button"
      type="button"
      underline="hover"
      onClick={onClick}
      sx={{ font: 'inherit', textAlign: 'inherit', verticalAlign: 'baseline' }}
    >
      {children}
    </MuiLink>
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
