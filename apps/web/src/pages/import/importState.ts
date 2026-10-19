import type { ExtractResponse, ImportDraft, ImportFile, ImportFileKind, SourceRow } from '@tickrs/shared';

export interface FileEntry {
  key: string;
  name: string;
  kind: ImportFileKind | null;
  status: 'reading' | 'read' | 'mapping' | 'signIn' | 'failed';
  error?: string;
  response?: ExtractResponse;
  prepared?: ImportFile;
  rows: SourceRow[];
}

export interface ImportState {
  files: FileEntry[];
  edits: Record<string, ImportDraft>;
  checked: Record<string, boolean>;
  targets: Record<string, string>;
  openingDates: Record<string, string>;
}

export type ImportAction =
  | { type: 'addFiles'; files: FileEntry[] }
  | { type: 'updateFile'; key: string; patch: Partial<FileEntry> }
  | { type: 'removeFile'; key: string }
  | { type: 'editRow'; rowId: string; draft: ImportDraft }
  | { type: 'check'; rowIds: string[]; value: boolean }
  | { type: 'chooseAccount'; currency: string; accountId: string; rowIds: string[] }
  | { type: 'accountsAdded'; byCurrency: Record<string, string> }
  | { type: 'setOpeningDate'; currency: string; date: string }
  | { type: 'rowsSaved'; rowIds: ReadonlySet<string> }
  | { type: 'allSaved' };

export const initialImportState: ImportState = {
  files: [],
  edits: {},
  checked: {},
  targets: {},
  openingDates: {},
};

const without = <T>(record: Record<string, T>, keys: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)));

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'addFiles':
      return { ...state, files: [...state.files, ...action.files] };
    case 'updateFile':
      return {
        ...state,
        files: state.files.map((f) => (f.key === action.key ? { ...f, ...action.patch } : f)),
      };
    case 'removeFile':
      return { ...state, files: state.files.filter((f) => f.key !== action.key) };
    case 'editRow':
      return {
        ...state,
        edits: { ...state.edits, [action.rowId]: action.draft },
        checked: without(state.checked, new Set([action.rowId])),
      };
    case 'check':
      return {
        ...state,
        checked: { ...state.checked, ...Object.fromEntries(action.rowIds.map((id) => [id, action.value])) },
      };
    case 'chooseAccount':
      return {
        ...state,
        targets: { ...state.targets, [action.currency]: action.accountId },
        checked: without(state.checked, new Set(action.rowIds)),
      };
    case 'accountsAdded':
      return { ...state, targets: { ...state.targets, ...action.byCurrency } };
    case 'setOpeningDate':
      return { ...state, openingDates: { ...state.openingDates, [action.currency]: action.date } };
    case 'rowsSaved':
      return {
        ...state,
        files: state.files.map((f) => ({ ...f, rows: f.rows.filter((r) => !action.rowIds.has(r.id)) })),
      };
    case 'allSaved':
      return { ...initialImportState, targets: state.targets };
  }
}
