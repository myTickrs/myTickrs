import { createTransactionSchema, transactionQuerySchema, updateTransactionSchema } from '@tickrs/shared';
import type { Router } from 'express';
import { type CtxOf, isConfirmed, parse } from '../http.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../services/transactions.js';

export function transactionRoutes(api: Router, ctxOf: CtxOf): void {
  api.get('/transactions', async (req, res) => {
    const query = parse(transactionQuerySchema, req.query, 'query');
    res.json(await listTransactions(ctxOf(req), query));
  });

  api.post('/transactions', async (req, res) => {
    const input = parse(createTransactionSchema, req.body);
    const created = await createTransaction(ctxOf(req), input);
    res.status(201).json({ items: created });
  });

  api.get('/transactions/:id', async (req, res) => {
    res.json(await getTransaction(ctxOf(req), req.params.id));
  });

  api.patch('/transactions/:id', async (req, res) => {
    const input = parse(updateTransactionSchema, req.body);
    res.json({ items: await updateTransaction(ctxOf(req), req.params.id, input) });
  });

  api.delete('/transactions/:id', async (req, res) => {
    await deleteTransaction(ctxOf(req), req.params.id, isConfirmed(req));
    res.status(204).end();
  });
}
