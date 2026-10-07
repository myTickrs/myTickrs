import { createHash } from 'node:crypto';
import { parse as parseCsvText } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import {
  IMPORT_MAX_ROWS,
  IMPORT_SAMPLE_ROWS,
  type StructuredFileKind,
  type StructuredRecords,
  type StructuredSample,
} from '@tickrs/shared';
import { AppError } from '../errors.js';

export interface StructuredTable {
  format: StructuredFileKind;
  recordPath: string | null;
  columns: string[];
  records: Record<string, string>[];
}

const unreadable = (message: string) => new AppError('IMPORT_UNREADABLE', 422, message);

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function uniqueColumns(header: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((name, i) => {
    const base = name.trim() || `Column ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

const tooMany = (count: number) =>
  unreadable(`This file has ${count} rows; the limit is ${IMPORT_MAX_ROWS}. Split it and import the parts.`);

function parseWith(text: string, delimiter: string): string[][] {
  return parseCsvText(text, {
    bom: true,
    delimiter,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as string[][];
}

export function readCsv(text: string): StructuredTable {
  let best: { table: string[][]; width: number; score: number } | null = null;
  for (const delimiter of [',', ';', '\t', '|']) {
    let table: string[][];
    try {
      table = parseWith(text, delimiter);
    } catch {
      continue;
    }
    const widths = new Map<number, number>();
    for (const row of table) if (row.length > 1) widths.set(row.length, (widths.get(row.length) ?? 0) + 1);
    const [width, count] = [...widths.entries()].toSorted((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
    const score = width > 1 ? count * width : 0;
    if (!best || score > best.score) best = { table, width, score };
  }
  if (!best || best.width < 2) throw unreadable('This file is not a table we can read');

  const start = best.table.findIndex((row) => row.length === best!.width);
  const columns = uniqueColumns(best.table[start]!);
  const body = best.table.slice(start + 1).filter((row) => row.some((cell) => cell !== ''));
  if (body.length > IMPORT_MAX_ROWS) throw tooMany(body.length);
  const records = body.map((cells) => Object.fromEntries(columns.map((c, j) => [c, cells[j] ?? ''])));
  return { format: 'csv', recordPath: null, columns, records };
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const isRecord = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function flatten(value: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (Array.isArray(value)) {
    if (value.every((v) => !isRecord(v) && !Array.isArray(v))) {
      out[prefix] = value.map((v) => String(v ?? '')).join(', ');
    } else {
      value.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
    }
  } else if (prefix) {
    out[prefix] = value == null ? '' : String(value);
  }
  return out;
}

const at = (root: Json, path: string): Json | undefined =>
  path.split('.').reduce<Json | undefined>((node, key) => (isRecord(node) ? node[key] : undefined), root);

function findRecords(root: Json): { path: string; items: Record<string, Json>[] } | null {
  let best: { path: string; items: Record<string, Json>[] } | null = null;
  const visit = (node: Json, path: string) => {
    if (Array.isArray(node)) {
      const objects = node.filter(isRecord);
      if (
        objects.length > 0 &&
        objects.length >= node.length / 2 &&
        (!best || objects.length > best.items.length)
      ) {
        best = { path, items: objects };
      }
      for (const item of node)
        if (isRecord(item)) for (const [k, v] of Object.entries(item)) visit(v, `${path}.${k}`);
    } else if (isRecord(node)) {
      for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(root, '');
  return best;
}

function toTable(format: 'json' | 'xml', root: Json, recordPath: string | null): StructuredTable {
  let found: { path: string; items: Record<string, Json>[] } | null;
  if (recordPath !== null) {
    const node = recordPath === '' ? root : at(root, recordPath);
    const items = Array.isArray(node) ? node.filter(isRecord) : isRecord(node) ? [node] : [];
    found = { path: recordPath, items };
  } else {
    found = findRecords(root);
  }
  if (!found || found.items.length === 0) throw unreadable('No list of records was found in this file');
  if (found.items.length > IMPORT_MAX_ROWS) throw tooMany(found.items.length);

  const records = found.items.map((item) => flatten(item));
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return { format, recordPath: found.path, columns, records };
}

export function readJson(text: string, recordPath: string | null = null): StructuredTable {
  let root: Json;
  try {
    root = JSON.parse(text.replace(/^﻿/, '')) as Json;
  } catch (error) {
    throw unreadable(`This file is not valid JSON: ${(error as Error).message}`);
  }
  return toTable('json', root, recordPath);
}

export function readXml(text: string, recordPath: string | null = null): StructuredTable {
  let root: Json;
  try {
    root = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      processEntities: true,
    }).parse(text, true) as Json;
  } catch (error) {
    throw unreadable(`This file is not valid XML: ${(error as Error).message}`);
  }
  return toTable('xml', root, recordPath);
}

export function fingerprintOf(table: Pick<StructuredTable, 'format' | 'recordPath' | 'columns'>): string {
  const columns = table.columns.map((c) => c.trim().toLowerCase()).toSorted();
  return createHash('sha256')
    .update(JSON.stringify([table.format, table.recordPath ?? '', columns]))
    .digest('hex');
}

const cap = (value: string) => (value.length > 1000 ? value.slice(0, 1000) : value);

const capped = (record: Record<string, string>) =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, cap(v)]));

export function sampleOf(table: StructuredTable): StructuredSample {
  return {
    format: table.format,
    recordPath: table.recordPath,
    columns: table.columns.slice(0, 300),
    records: table.records.slice(0, IMPORT_SAMPLE_ROWS).map(capped),
  };
}

export function recordsOf(table: StructuredTable): StructuredRecords {
  return {
    format: table.format,
    recordPath: table.recordPath,
    columns: table.columns.slice(0, 300),
    records: table.records.map(capped),
  };
}
