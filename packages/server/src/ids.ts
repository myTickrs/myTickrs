import { v7 as uuidv7 } from 'uuid';

export const newId = (): string => uuidv7();

export const nowIso = (): string => new Date().toISOString();
