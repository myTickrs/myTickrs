import MuiAutocomplete from '@mui/material/Autocomplete';
import MuiCheckbox from '@mui/material/Checkbox';
import MuiFormControlLabel from '@mui/material/FormControlLabel';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiStack from '@mui/material/Stack';
import MuiSwitch from '@mui/material/Switch';
import MuiTextField from '@mui/material/TextField';
import MuiToggleButton from '@mui/material/ToggleButton';
import MuiToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import MuiTooltip from '@mui/material/Tooltip';
import MuiTypography from '@mui/material/Typography';
import type { ChangeEvent, FormEvent } from 'react';

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
