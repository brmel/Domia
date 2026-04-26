import { createServer, type Server } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
};

export interface FixtureServerHandle {
    readonly baseUrl: string;
    stop: () => Promise<void>;
}

export async function startFixtureServer(rootDir: string): Promise<FixtureServerHandle> {
    const absoluteRoot = resolve(rootDir);

    const server = createServer(async (req, res) => {
        try {
            const reqPath = (req.url || '/').split('?')[0] || '/';
            const safePath = reqPath === '/' ? '/index.html' : reqPath;
            const normalizedPath = normalize(safePath).replace(/^\.+/, '');
            const targetPath = resolve(join(absoluteRoot, normalizedPath));

            if (!targetPath.startsWith(absoluteRoot)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }

            const content = await readFile(targetPath);
            const mimeType = MIME_TYPES[extname(targetPath).toLowerCase()] || 'application/octet-stream';

            res.statusCode = 200;
            res.setHeader('Content-Type', mimeType);
            res.end(content);
        } catch (_error) {
            res.statusCode = 404;
            res.end('Not found');
        }
    });

    await new Promise<void>((resolveStart, rejectStart) => {
        server.once('error', rejectStart);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', rejectStart);
            resolveStart();
        });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to start fixture server.');
    }

    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        stop: () => stopServer(server)
    };
}

function stopServer(server: Server): Promise<void> {
    return new Promise((resolveStop) => {
        server.close(() => resolveStop());
    });
}
