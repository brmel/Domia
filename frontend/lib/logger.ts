import { pino } from 'pino';

const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;

export const logger = pino({
    browser: { asObject: true },
    level: mode === 'production' ? 'info' : 'debug',
});
