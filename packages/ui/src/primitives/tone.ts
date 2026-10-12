export type Tone = 'default' | 'positive' | 'negative' | 'warning' | 'info' | 'secondary';

export const TONE_COLOR = {
  default: 'text.primary',
  positive: 'success.main',
  negative: 'error.main',
  warning: 'warning.main',
  info: 'info.main',
  secondary: 'secondary.main',
} as const;
