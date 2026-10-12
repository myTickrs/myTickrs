import MuiBox from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import MuiTypography from '@mui/material/Typography';
import { useState, type ChangeEvent, type DragEvent } from 'react';

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
