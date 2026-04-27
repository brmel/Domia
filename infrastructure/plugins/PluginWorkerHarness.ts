export const PLUGIN_WORKER_HARNESS_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const vm = require('node:vm');

const { pluginPath, capabilities, vmTimeoutMs } = workerData;

const sandbox = { module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
if (capabilities.includes('zod')) {
    sandbox.z = require('zod').z ?? require('zod');
}
if (capabilities.includes('logger')) {
    sandbox.log = {
        info: (m) => parentPort.postMessage({ type: 'log', level: 'info', message: String(m) }),
        warn: (m) => parentPort.postMessage({ type: 'log', level: 'warn', message: String(m) }),
        error: (m) => parentPort.postMessage({ type: 'log', level: 'error', message: String(m) }),
        debug: (m) => parentPort.postMessage({ type: 'log', level: 'debug', message: String(m) }),
    };
}

const source = fs.readFileSync(pluginPath, 'utf8');
const ctx = vm.createContext(sandbox);
new vm.Script(source, { filename: pluginPath }).runInContext(ctx, { timeout: vmTimeoutMs });

const plugin = sandbox.module.exports;
const tools = Array.isArray(plugin && plugin.tools) ? plugin.tools : [];

parentPort.on('message', (msg) => {
    if (msg.type === 'list-tools') {
        parentPort.postMessage({
            type: 'tools',
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                actionType: t.actionType,
                parameters: t.parameters,
                platforms: t.platforms,
            })),
        });
        return;
    }
    if (msg.type === 'execute') {
        const tool = tools.find((t) => t.name === msg.toolName);
        if (!tool || typeof tool.execute !== 'function') {
            parentPort.postMessage({ type: 'error', id: msg.id, error: 'Unknown tool: ' + msg.toolName });
            return;
        }
        Promise.resolve()
            .then(() => tool.execute(msg.args))
            .then((value) => parentPort.postMessage({ type: 'result', id: msg.id, value }))
            .catch((err) => parentPort.postMessage({ type: 'error', id: msg.id, error: err && err.message ? err.message : String(err) }));
    }
});
`;
