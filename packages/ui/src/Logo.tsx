import MuiBox from '@mui/material/Box';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <MuiBox
      component="svg"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      sx={{ width: size, height: size, flexShrink: 0, color: 'text.primary', display: 'block' }}
    >
      <circle cx="21" cy="21" r="14" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <line
        x1="31.5"
        y1="31.5"
        x2="41"
        y2="41"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <MuiBox component="g" sx={{ color: 'primary.main' }}>
        <polyline
          points="13,26 18,21 22,24 28,16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="28" cy="16" r="2.8" fill="currentColor" />
      </MuiBox>
    </MuiBox>
  );
}
