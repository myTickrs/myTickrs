import CssBaseline from '@mui/material/CssBaseline';
import { deDE, enUS, esES, frFR, itIT, jaJP, koKR, zhCN, zhTW } from '@mui/material/locale';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLanguage, type Language } from './i18n.js';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeColor = 'blue' | 'green';
export const THEME_COLORS: readonly ThemeColor[] = ['green', 'blue'];

interface ThemeControl {
  mode: ThemeMode;
  setMode(mode: ThemeMode): void;
  resolved: 'light' | 'dark';
  color: ThemeColor;
  setColor(color: ThemeColor): void;
}

const ThemeContext = createContext<ThemeControl>({
  mode: 'system',
  setMode: () => {},
  resolved: 'light',
  color: 'green',
  setColor: () => {},
});
export const useThemeMode = (): ThemeControl => use(ThemeContext);

const STORAGE_KEY = 'tickrs.theme';
const COLOR_STORAGE_KEY = 'tickrs.themeColor';

const PRIMARY: Record<ThemeColor, { light: string; dark: string }> = {
  blue: { light: '#1f4fd8', dark: '#8ab4ff' },
  green: { light: '#17855a', dark: '#34c28a' },
};

const MUI_LOCALES = {
  en: enUS,
  fr: frFR,
  de: deDE,
  it: itIT,
  es: esES,
  ja: jaJP,
  ko: koKR,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} as const satisfies Record<Language, unknown>;

const LATIN_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto';

const FONT_FAMILY: Record<Language, string> = {
  en: `${LATIN_FONTS}, sans-serif`,
  fr: `${LATIN_FONTS}, sans-serif`,
  de: `${LATIN_FONTS}, sans-serif`,
  it: `${LATIN_FONTS}, sans-serif`,
  es: `${LATIN_FONTS}, sans-serif`,
  ja: `${LATIN_FONTS}, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif`,
  ko: `${LATIN_FONTS}, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`,
  'zh-CN': `${LATIN_FONTS}, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`,
  'zh-TW': `${LATIN_FONTS}, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`,
};

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function readStoredColor(): ThemeColor {
  try {
    const stored = localStorage.getItem(COLOR_STORAGE_KEY);
    return stored === 'blue' ? 'blue' : 'green';
  } catch {
    return 'green';
  }
}

export function AppTheme({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [color, setColorState] = useState<ThemeColor>(readStoredColor);
  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const { language, dir } = useLanguage();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(COLOR_STORAGE_KEY, color);
    } catch {}
  }, [color]);

  const theme = useMemo(
    () =>
      createTheme(
        {
          direction: dir,
          palette: {
            mode: resolved,
            primary: { main: PRIMARY[color][resolved] },
            info: { main: PRIMARY[color][resolved] },
            secondary: { main: resolved === 'dark' ? '#c49bf0' : '#7b3fb8' },
            success: { main: resolved === 'dark' ? '#5cc98a' : '#1d7a46' },
            error: { main: resolved === 'dark' ? '#f2877e' : '#b3261e' },
            background: {
              default: resolved === 'dark' ? '#141413' : '#f7f7f5',
              paper: resolved === 'dark' ? '#1f1f1d' : '#ffffff',
            },
          },
          shape: { borderRadius: 10 },
          typography: { fontFamily: FONT_FAMILY[language] },
          components: {
            MuiTableCell: { styleOverrides: { root: { fontVariantNumeric: 'tabular-nums' } } },
            MuiButton: { defaultProps: { disableElevation: true } },
          },
        },
        MUI_LOCALES[language],
      ),
    [resolved, color, language, dir],
  );

  const control = useMemo<ThemeControl>(
    () => ({ mode, setMode: setModeState, resolved, color, setColor: setColorState }),
    [mode, resolved, color],
  );

  return (
    <ThemeContext value={control}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext>
  );
}
