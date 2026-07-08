#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';
import http from 'node:http';
import { container } from 'tsyringe';
import { registerCoreServices } from '@backend/container-root';
import { DEFAULT_SERVER_PORT } from '@shared/defaults';
import type { ILogger } from '@domain/ports';
import { handleDomiaRequest } from './routes';

registerCoreServices();

const logger = container.resolve<ILogger>('ILogger');
const port = Number(process.env['DOMIA_SERVER_PORT'] ?? DEFAULT_SERVER_PORT);
// Localhost by default — run data should not be LAN-visible unless opted in.
const host = process.env['DOMIA_SERVER_HOST'] ?? '127.0.0.1';

const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', `http://localhost:${port}`).pathname;
    const { status, body } = await handleDomiaRequest(pathname).catch((e: unknown) => ({
        status: 500,
        body: { error: e instanceof Error ? e.message : String(e) },
    }));
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
});

server.listen(port, host, () => {
    logger.info(`[domia-server] listening on http://${host}:${port}`);
});
