import MuiDivider from '@mui/material/Divider';
import MuiStack from '@mui/material/Stack';
import MuiTypography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { TONE_COLOR, type Tone } from './tone.js';

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
