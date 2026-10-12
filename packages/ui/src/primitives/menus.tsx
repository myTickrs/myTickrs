import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import MuiButton from '@mui/material/Button';
import MuiIconButton from '@mui/material/IconButton';
import MuiListItemIcon from '@mui/material/ListItemIcon';
import MuiListItemText from '@mui/material/ListItemText';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

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
