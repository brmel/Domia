import { injectable, inject } from 'tsyringe';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker } from 'node:worker_threads';
import type { ILogger } from '@domain/ports';
import type { PluginName } from '@domain/ports/plugins/IPlugin';
import type { ToolResult } from '@domain/types/ToolTypes';
import { PluginRegistry } from './PluginRegistry';
import {
    buildToolSpecsFromWorker,
    validatePluginMetadata,
    type PluginMetadata,
    type WorkerToolDescriptor,
} from './PluginManifest';
import { PLUGIN_WORKER_HARNESS_SOURCE } from './PluginWorkerHarness';
import { PLUGIN_TOOL_EXEC_TIMEOUT_MS, PLUGIN_VM_TIMEOUT_MS } from '@shared/defaults/plugin.defaults';

const PLUGIN_ENTRY_FILE = 'index.js';
const PLUGIN_METADATA_FILE = 'plugin.json';
const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.domia', 'plugins');

interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

@injectable()
export class PluginLoader {
    private readonly workers: Worker[] = [];
    private disposed = false;

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(PluginRegistry) private readonly registry: PluginRegistry,
    ) {}

    async loadAll(pluginDir?: string, builtInNames?: ReadonlySet<string>): Promise<void> {
        const dir = pluginDir ?? DEFAULT_PLUGIN_DIR;
        const names = builtInNames ?? new Set<string>();

        let entries: string[];
        try {
            entries = await fs.readdir(dir);
        } catch {
            this.logger.debug(`[PluginLoader] Plugin directory not found: ${dir}`);
            return;
        }

        for (const entry of entries) {
            const entryPath = path.join(dir, entry);
            const stat = await fs.stat(entryPath).catch(() => null);
            if (!stat?.isDirectory()) continue;

            try {
                await this.loadPlugin(entryPath, names);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`[PluginLoader] Failed to load plugin "${entry}": ${msg}`);
            }
        }
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        await Promise.all(this.workers.map((w) => w.terminate()));
        this.workers.length = 0;
    }

    private async loadPlugin(pluginPath: string, builtInNames: ReadonlySet<string>): Promise<void> {
        const metadataPath = path.join(pluginPath, PLUGIN_METADATA_FILE);
        const indexPath = path.join(pluginPath, PLUGIN_ENTRY_FILE);

        const metadataStat = await fs.stat(metadataPath).catch(() => null);
        if (!metadataStat?.isFile()) {
            this.logger.debug(`[PluginLoader] No ${PLUGIN_METADATA_FILE} in ${pluginPath}, skipping`);
            return;
        }
        const indexStat = await fs.stat(indexPath).catch(() => null);
        if (!indexStat?.isFile()) {
            this.logger.debug(`[PluginLoader] No ${PLUGIN_ENTRY_FILE} in ${pluginPath}, skipping`);
            return;
        }

        const metadataRaw = await fs.readFile(metadataPath, 'utf8');
        const meta = validatePluginMetadata(JSON.parse(metadataRaw));

        const worker = await this.spawnWorker(indexPath, meta);
        const descriptors = await this.requestTools(worker);
        const pending = new Map<string, PendingCall>();
        this.attachRpcHandlers(worker, pending, meta.name);

        let nextId = 0;
        const tools = buildToolSpecsFromWorker(descriptors, (toolName, args) => {
            return new Promise<ToolResult>((resolve, reject) => {
                const id = String(++nextId);
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`[PluginLoader] Plugin "${meta.name}" tool "${toolName}" timed out after ${PLUGIN_TOOL_EXEC_TIMEOUT_MS}ms`));
                }, PLUGIN_TOOL_EXEC_TIMEOUT_MS);
                pending.set(id, {
                    resolve: (value) => resolve(value as ToolResult),
                    reject,
                    timer,
                });
                worker.postMessage({ type: 'execute', id, toolName, args });
            });
        });

        this.registry.register(
            {
                name: meta.name as PluginName,
                version: meta.version,
                description: meta.description,
                capabilities: meta.capabilities,
                tools,
            },
            builtInNames,
        );
        this.workers.push(worker);
    }

    private spawnWorker(pluginPath: string, meta: PluginMetadata): Promise<Worker> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(PLUGIN_WORKER_HARNESS_SOURCE, {
                eval: true,
                workerData: { pluginPath, capabilities: meta.capabilities, vmTimeoutMs: PLUGIN_VM_TIMEOUT_MS },
                stdout: false,
                stderr: false,
            });
            const onError = (err: Error): void => {
                worker.removeListener('online', onOnline);
                reject(err);
            };
            const onOnline = (): void => {
                worker.removeListener('error', onError);
                resolve(worker);
            };
            worker.once('error', onError);
            worker.once('online', onOnline);
        });
    }

    private requestTools(worker: Worker): Promise<readonly WorkerToolDescriptor[]> {
        return new Promise((resolve, reject) => {
            const onMessage = (msg: unknown): void => {
                if (typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'tools') {
                    worker.removeListener('message', onMessage);
                    worker.removeListener('error', onError);
                    resolve(((msg as { tools?: WorkerToolDescriptor[] }).tools ?? []));
                }
            };
            const onError = (err: Error): void => {
                worker.removeListener('message', onMessage);
                reject(err);
            };
            worker.on('message', onMessage);
            worker.once('error', onError);
            worker.postMessage({ type: 'list-tools' });
        });
    }

    private attachRpcHandlers(worker: Worker, pending: Map<string, PendingCall>, pluginName: string): void {
        worker.on('message', (msg: unknown) => {
            if (typeof msg !== 'object' || msg === null) return;
            const m = msg as { type?: string; id?: string; value?: unknown; error?: string; level?: string; message?: string };
            if (m.type === 'log') {
                const level = m.level ?? 'info';
                const text = `[plugin:${pluginName}] ${m.message ?? ''}`;
                if (level === 'warn') this.logger.warn(text);
                else if (level === 'error') this.logger.error(text);
                else if (level === 'debug') this.logger.debug(text);
                else this.logger.info(text);
                return;
            }
            if (!m.id) return;
            const call = pending.get(m.id);
            if (!call) return;
            pending.delete(m.id);
            clearTimeout(call.timer);
            if (m.type === 'result') call.resolve(m.value);
            else if (m.type === 'error') call.reject(new Error(m.error ?? 'plugin error'));
        });
        worker.on('error', (err: Error) => this.logger.error(`[PluginLoader] Plugin "${pluginName}" worker error: ${err.message}`));
        worker.on('exit', (code) => {
            if (this.disposed) return;
            if (code !== 0) this.logger.warn(`[PluginLoader] Plugin "${pluginName}" worker exited with code ${code}`);
        });
    }
}
