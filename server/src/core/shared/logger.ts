type LogLevel = 'info' | 'warn' | 'error';

export interface LogMeta {
  requestId?: string;
  [key: string]: unknown;
}

const writeLog = (level: LogLevel, message: string, meta: LogMeta = {}): void => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info: (message: string, meta?: LogMeta) => writeLog('info', message, meta),
  warn: (message: string, meta?: LogMeta) => writeLog('warn', message, meta),
  error: (message: string, meta?: LogMeta) => writeLog('error', message, meta),
};
