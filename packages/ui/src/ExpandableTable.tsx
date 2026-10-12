import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import MuiIconButton from '@mui/material/IconButton';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableContainer from '@mui/material/TableContainer';
import MuiTableHead from '@mui/material/TableHead';
import MuiTablePagination from '@mui/material/TablePagination';
import MuiTableRow from '@mui/material/TableRow';
import { Fragment, useState, type ReactNode } from 'react';
import { cellSx, DENSE_TABLE_SX, widthSx, type Column, type DataTableProps } from './DataTable.js';
import { useLanguage } from './i18n.js';
import { useT } from './messages.js';
import { EmptyState } from './primitives.js';

export interface ExpandableTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T): string;
  caption: string;
  empty?: string;
  renderExpanded(row: T): ReactNode;
  expandLabel(row: T): string;
  defaultExpanded?: boolean;
  pagination?: DataTableProps<T>['pagination'];
  dense?: boolean;
}

export function ExpandableTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  renderExpanded,
  expandLabel,
  defaultExpanded = true,
  pagination,
  dense,
}: ExpandableTableProps<T>) {
  const t = useT();
  const { dir } = useLanguage();
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (rows.length === 0) return <EmptyState title={empty ?? t('common.nothingYet')} />;
  const keys = rows.map(rowKey);
  const allOpen = keys.every((k) => toggled.has(k) !== defaultExpanded);
  const setAll = (open: boolean) => setToggled(new Set(open === defaultExpanded ? [] : keys));
  return (
    <>
      <MuiTableContainer sx={dense ? DENSE_TABLE_SX : undefined}>
        <MuiTable size="small" aria-label={caption}>
          <caption className="visually-hidden">{caption}</caption>
          <MuiTableHead>
            <MuiTableRow>
              <MuiTableCell padding="checkbox">
                <MuiIconButton
                  size="small"
                  aria-label={allOpen ? t('table.collapseAll') : t('table.expandAll')}
                  title={allOpen ? t('table.collapseAll') : t('table.expandAll')}
                  onClick={() => setAll(!allOpen)}
                >
                  {allOpen ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
                </MuiIconButton>
              </MuiTableCell>
              {columns.map((c) => (
                <MuiTableCell
                  key={c.key}
                  align={c.align ?? 'left'}
                  sx={{ whiteSpace: 'nowrap', ...widthSx(c) }}
                >
                  {c.header}
                </MuiTableCell>
              ))}
            </MuiTableRow>
          </MuiTableHead>
          <MuiTableBody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isOpen = toggled.has(key) !== defaultExpanded;
              return (
                <Fragment key={key}>
                  <MuiTableRow
                    hover
                    onClick={() => toggle(key)}
                    sx={{
                      cursor: 'pointer',
                      '& > td': { fontWeight: 600, ...(isOpen && { borderBottom: 'none' }) },
                      '& > td .MuiTypography-root': { fontWeight: 'inherit' },
                    }}
                  >
                    <MuiTableCell padding="checkbox">
                      <MuiIconButton
                        size="small"
                        aria-label={expandLabel(row)}
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(key);
                        }}
                      >
                        {isOpen ? (
                          <KeyboardArrowDownIcon fontSize="small" />
                        ) : (
                          <KeyboardArrowRightIcon
                            fontSize="small"
                            sx={dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined}
                          />
                        )}
                      </MuiIconButton>
                    </MuiTableCell>
                    {columns.map((c) => (
                      <MuiTableCell key={c.key} align={c.align ?? 'left'} sx={cellSx(c)}>
                        {c.render(row)}
                      </MuiTableCell>
                    ))}
                  </MuiTableRow>
                  {isOpen && (
                    <MuiTableRow>
                      <MuiTableCell
                        colSpan={columns.length + 1}
                        sx={{
                          py: 1.5,
                          paddingInlineStart: 6,
                          bgcolor: 'action.hover',
                          '& thead th': { fontWeight: 400 },
                        }}
                      >
                        {renderExpanded(row)}
                      </MuiTableCell>
                    </MuiTableRow>
                  )}
                </Fragment>
              );
            })}
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
