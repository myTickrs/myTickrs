import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableContainer from '@mui/material/TableContainer';
import MuiTableHead from '@mui/material/TableHead';
import MuiTablePagination from '@mui/material/TablePagination';
import MuiTableRow from '@mui/material/TableRow';
import MuiTableSortLabel from '@mui/material/TableSortLabel';
import type { ReactNode } from 'react';
import { useT } from './messages.js';
import { EmptyState } from './primitives.js';

export interface Column<T> {
  key: string;
  header: string;
  headerCell?: ReactNode;
  align?: 'left' | 'right';
  sortable?: boolean;
  nowrap?: boolean;
  width?: number;
  render(row: T): ReactNode;
  text?(row: T): string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T): string;
  caption: string;
  empty?: string;
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?(key: string): void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange(page: number): void;
    onPageSizeChange?(size: number): void;
  };
  onRowClick?(row: T): void;
  dense?: boolean;
}

export const DENSE_TABLE_SX = {
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
  '& .MuiTableCell-root': { px: 1, py: 0.5, fontSize: '0.8125rem' },
  '& .MuiTableCell-root .MuiTypography-root': { fontSize: 'inherit' },
  '& .MuiChip-sizeSmall': { height: 18, fontSize: '0.6875rem' },
  '& .MuiChip-sizeSmall .MuiChip-label': { px: 0.75 },
} as const;

export function widthSx<T>(c: Column<T>) {
  return c.width === undefined ? {} : { width: c.width, maxWidth: c.width, overflowWrap: 'anywhere' };
}

export function cellSx<T>(c: Column<T>) {
  if (!c.nowrap && c.width === undefined) return undefined;
  return { ...(c.nowrap ? { whiteSpace: 'nowrap' } : {}), ...widthSx(c) } as const;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  sort,
  onSortChange,
  pagination,
  onRowClick,
  dense,
}: DataTableProps<T>) {
  const t = useT();
  if (rows.length === 0) return <EmptyState title={empty ?? t('common.nothingYet')} />;
  return (
    <>
      <MuiTableContainer sx={dense ? DENSE_TABLE_SX : undefined}>
        <MuiTable size="small" aria-label={caption}>
          <caption className="visually-hidden">{caption}</caption>
          <MuiTableHead>
            <MuiTableRow>
              {columns.map((c) => (
                <MuiTableCell
                  key={c.key}
                  align={c.align ?? 'left'}
                  sx={{ whiteSpace: 'nowrap', ...widthSx(c) }}
                >
                  {c.sortable && onSortChange ? (
                    <MuiTableSortLabel
                      active={sort?.key === c.key}
                      direction={sort?.key === c.key ? sort.direction : 'asc'}
                      onClick={() => onSortChange(c.key)}
                    >
                      {c.header}
                    </MuiTableSortLabel>
                  ) : (
                    (c.headerCell ?? c.header)
                  )}
                </MuiTableCell>
              ))}
            </MuiTableRow>
          </MuiTableHead>
          <MuiTableBody>
            {rows.map((row) => (
              <MuiTableRow
                key={rowKey(row)}
                hover={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((c) => (
                  <MuiTableCell key={c.key} align={c.align ?? 'left'} sx={cellSx(c)}>
                    {c.render(row)}
                  </MuiTableCell>
                ))}
              </MuiTableRow>
            ))}
          </MuiTableBody>
        </MuiTable>
      </MuiTableContainer>
      {pagination && (
        <MuiTablePagination
          component="div"
          count={pagination.total}
          page={pagination.page - 1}
          rowsPerPage={pagination.pageSize}
          onPageChange={(_e, page) => pagination.onPageChange(page + 1)}
          onRowsPerPageChange={
            pagination.onPageSizeChange
              ? (e) => pagination.onPageSizeChange!(Number(e.target.value))
              : undefined
          }
          rowsPerPageOptions={[25, 50, 100]}
        />
      )}
    </>
  );
}
