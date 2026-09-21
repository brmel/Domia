import pino, { type Logger as PinoLogger } from 'pino';
import type { Logger } from '@domia/contracts';

export class PinoLoggerAdapter implements Logger {
  constructor(private readonly p: PinoLogger) {}
  debug(msg: string, data?: Record<string, unknown>): void { this.p.debug(data ?? {}, msg); }
  info(msg: string, data?: Record<string, unknown>): void { this.p.info(data ?? {}, msg); }
  warn(msg: string, data?: Record<string, unknown>): void { this.p.warn(data ?? {}, msg); }
  error(msg: string, data?: Record<string, unknown>): void { this.p.error(data ?? {}, msg); }
  child(bindings: Record<string, unknown>): Logger { return new PinoLoggerAdapter(this.p.child(bindings)); }
}

export function rootLogger(level: string): Logger {
  // Logs to stderr so stdout stays clean for command output (--json, pipes).
  return new PinoLoggerAdapter(pino({ level }, pino.destination(2)));
}
