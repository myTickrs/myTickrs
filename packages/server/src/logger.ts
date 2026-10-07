import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { destination, multistream, pino, transport, type DestinationStream, type Logger } from 'pino';
import type { ServerConfig } from './server-config.js';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.api_key',
  '*.password',
  '*.id_token',
  '*.idToken',
  '*.client_secret',
  '*.clientSecret',
];

export interface ErrorLogConfig {
  dir: string;
  days: number;
}

export function createLogger(
  config: Pick<ServerConfig, 'env' | 'logLevel'> & { errorLog?: ErrorLogConfig | null },
  deps: { stdout?: DestinationStream; now?: () => Date } = {},
): Logger {
  const options = { level: config.logLevel, redact: { paths: REDACT_PATHS, censor: '[redacted]' } };
  if (config.env === 'test' && !deps.stdout) return pino({ ...options, level: 'silent' });
  const stdout =
    deps.stdout ??
    (config.env === 'development'
      ? transport({ target: 'pino-pretty', options: { colorize: true } })
      : destination({ dest: 1, sync: true }));
  if (!config.errorLog) return pino(options, stdout);
  const file = dailyErrorFile({ ...config.errorLog, now: deps.now });
  return pino(
    options,
    multistream([
      { level: 'trace', stream: stdout },
      { level: 'error', stream: file },
    ]),
  );
}

const localDate = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

export function dailyErrorFile(deps: ErrorLogConfig & { now?: () => Date }): { write(line: string): void } {
  const { dir, days } = deps;
  const now = deps.now ?? (() => new Date());
  let day = '';

  const prune = (at: Date) => {
    const first = new Date(at.getFullYear(), at.getMonth(), at.getDate() - (days - 1));
    const oldest = localDate(first);
    for (const name of readdirSync(dir)) {
      const match = /^errors-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
      if (match && match[1]! < oldest) rmSync(path.join(dir, name), { force: true });
    }
  };
  const rollover = (at: Date) => {
    const today = localDate(at);
    if (today === day) return;
    day = today;
    mkdirSync(dir, { recursive: true });
    prune(at);
  };

  try {
    rollover(now());
  } catch (error) {
    process.stderr.write(`Could not prepare the error log in ${dir}: ${String(error)}\n`);
  }
  return {
    write(line) {
      try {
        rollover(now());
        appendFileSync(path.join(dir, `errors-${day}.log`), line);
      } catch (error) {
        process.stderr.write(`Could not write the error log in ${dir}: ${String(error)}\n`);
      }
    },
  };
}
