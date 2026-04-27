import pino, { type Logger } from 'pino';
import { config } from '../config.js';

const isDev = config.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (config.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: {
    service: 'premier-tree-intake',
    env: config.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,service,env',
      },
    },
  }),
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
