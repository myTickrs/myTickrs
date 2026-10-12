import CheckIcon from '@mui/icons-material/Check';
import TranslateIcon from '@mui/icons-material/Translate';
import MuiIconButton from '@mui/material/IconButton';
import MuiListItemIcon from '@mui/material/ListItemIcon';
import MuiListItemText from '@mui/material/ListItemText';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import { useId, useState } from 'react';
import { SUPPORTED_LANGUAGES, useLanguage } from './i18n.js';
import { useT } from './messages.js';

export function LanguageMenu() {
  const t = useT();
  const { language, setLanguage } = useLanguage();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const label = t('shell.language');

  return (
    <>
      <MuiIconButton
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        size="small"
      >
        <TranslateIcon fontSize="small" />
      </MuiIconButton>
      <MuiMenu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <MuiMenuItem
            key={l.code}
            lang={l.code}
            selected={l.code === language}
            onClick={() => {
              setAnchor(null);
              if (l.code !== language) setLanguage(l.code);
            }}
          >
            <MuiListItemIcon>{l.code === language && <CheckIcon fontSize="small" />}</MuiListItemIcon>
            <MuiListItemText>{l.name}</MuiListItemText>
          </MuiMenuItem>
        ))}
      </MuiMenu>
    </>
  );
}
