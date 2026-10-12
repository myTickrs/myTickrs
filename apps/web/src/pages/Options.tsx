import { useState } from 'react';
import { Banner, Button, Col, Row, Tabs, Text } from '@tickrs/ui';
import { DeletePositionDialog, useDeletePosition } from '../features/DeletePositionDialog.js';
import { DeleteTransactionDialog, useDeleteTransaction } from '../features/DeleteTransactionDialog.js';
import { EditPositionDialog } from '../features/EditPositionDialog.js';
import { EditTransactionDialog } from '../features/EditTransactionDialog.js';
import { OptionMarkDialog } from '../features/OptionMarkDialog.js';
import { RollDialog } from '../features/RollDialog.js';
import { TransactionDialog } from '../features/TransactionDialog.js';
import { useT } from '../i18n.js';
import type { OptionPosition, Transaction } from '../lib/api.js';
import {
  useAccounts,
  useNeedsAction,
  useOptionHistory,
  useOptionIncome,
  useOptionPositions,
} from '../lib/queries.js';
import { NeedsActionCard } from './options/NeedsActionCard.js';
import { OpenPositions } from './options/OpenPositions.js';
import { OptionHistory, type Outcome } from './options/OptionHistory.js';
import { OptionIncomeTab } from './options/OptionIncomeTab.js';

export function OptionsPage() {
  const t = useT();
  const [tab, setTab] = useState<'open' | 'history' | 'income'>('open');
  const positions = useOptionPositions();
  const needsAction = useNeedsAction();
  const income = useOptionIncome();
  const history = useOptionHistory(tab === 'history');
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | 'ALL'>('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<OptionPosition | null>(null);
  const [editing, setEditing] = useState<OptionPosition | null>(null);
  const [rolling, setRolling] = useState<OptionPosition | null>(null);
  const [closing, setClosing] = useState<OptionPosition | null>(null);
  const [adding, setAdding] = useState(false);
  const accounts = useAccounts();
  const deletion = useDeletePosition(setError);
  const removeTxn = useDeleteTransaction(setError);

  return (
    <Col gap={3}>
      <Row justify="between" wrap>
        <Text variant="title">{t('options.title')}</Text>
        <Button variant="primary" onClick={() => setAdding(true)} data-testid="add-option">
          {t('options.add')}
        </Button>
      </Row>
      {error && <Banner tone="error">{error}</Banner>}

      {needsAction.data && needsAction.data.items.length > 0 && (
        <NeedsActionCard items={needsAction.data.items} onError={setError} />
      )}

      <Tabs
        value={tab}
        onChange={(v) => setTab(v === 'history' || v === 'income' ? v : 'open')}
        tabs={[
          { value: 'open', label: t('options.openPositions') },
          { value: 'history', label: t('options.history') },
          { value: 'income', label: t('options.income') },
        ]}
      />

      {tab === 'open' && (
        <OpenPositions
          positions={positions.data?.items ?? []}
          loading={positions.isLoading}
          actions={{
            mark: setMarking,
            roll: setRolling,
            close: setClosing,
            edit: setEditing,
            remove: (o) => void deletion.ask(o),
            removing: deletion.busy,
          }}
        />
      )}

      {tab === 'history' && (
        <OptionHistory
          items={history.data?.items ?? []}
          loading={history.isLoading}
          outcome={outcomeFilter}
          onOutcomeChange={setOutcomeFilter}
          page={historyPage}
          onPageChange={setHistoryPage}
          actions={{
            edit: setEditingTxn,
            remove: (tx) => void removeTxn.ask(tx),
            removing: removeTxn.busy,
          }}
        />
      )}

      <EditPositionDialog
        key={`edit-${editing?.contractId ?? 'none'}`}
        position={editing}
        onClose={() => setEditing(null)}
      />

      <OptionMarkDialog
        key={marking?.contractId ?? 'none'}
        position={marking}
        onClose={() => setMarking(null)}
      />

      <TransactionDialog
        mode="option"
        open={adding}
        onClose={() => setAdding(false)}
        accounts={accounts.data?.items ?? []}
      />

      <TransactionDialog
        key={`close-${closing?.contractId ?? 'none'}`}
        mode="option"
        open={closing !== null}
        closing={closing}
        onClose={() => setClosing(null)}
        accounts={accounts.data?.items ?? []}
      />

      <DeletePositionDialog {...deletion.dialogProps} />

      <EditTransactionDialog
        key={`edit-txn-${editingTxn?.id ?? 'none'}`}
        transaction={editingTxn}
        accounts={accounts.data?.items ?? []}
        onClose={() => setEditingTxn(null)}
      />
      <DeleteTransactionDialog {...removeTxn.dialogProps} />

      <RollDialog
        key={`roll-${rolling?.contractId ?? 'none'}`}
        position={rolling}
        onClose={() => setRolling(null)}
      />

      {tab === 'income' && income.data && <OptionIncomeTab income={income.data} />}
    </Col>
  );
}
