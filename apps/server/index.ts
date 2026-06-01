#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';
import http from 'node:http';
import { registerCoreServices } from '@backend/container-root';
import { DEFAULT_SERVER_PORT } from '@shared/defaults';
import { handleDomiaRequest } from './routes';

registerCoreServices();

const port = Number(process.env['DOMIA_SERVER_PORT'] ?? DEFAULT_SERVER_PORT);

const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', `http://localhost:${port}`).pathname;
    const { status, body } = await handleDomiaRequest(pathname).catch((e: unknown) => ({
        status: 500,
        body: { error: e instanceof Error ? e.message : String(e) },
    }));
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
});

server.listen(port, () => {
    console.log(`[domia-server] listening on http://localhost:${port}`);
});
