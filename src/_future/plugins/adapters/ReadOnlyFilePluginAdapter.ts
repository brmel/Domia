import fs from 'fs-extra';
import path from 'path';
import type { PluginCapability, PluginInvocationRequest, PluginInvocationResult, PluginManifest } from '@domain/plugins/PluginManifest';
import type { PluginExecutionAdapter } from '../PluginExecutionAdapterRegistryService';

export class ReadOnlyFilePluginAdapter implements PluginExecutionAdapter {
    private static readonly MAX_PREVIEW_CHARS = 4000;

    supports(capability: PluginCapability): boolean {
        return capability === 'fs.read';
    }

    execute(_manifest: PluginManifest, request: PluginInvocationRequest): PluginInvocationResult {
        const rawPath = request.payload['path'];
        if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
            return {
                success: false,
                message: 'Plugin fs.read requires payload.path'
            };
        }

        const workspaceRoot = process.cwd();
        const requestedPath = path.resolve(workspaceRoot, rawPath);

        if (!requestedPath.startsWith(path.resolve(workspaceRoot))) {
            return {
                success: false,
                message: 'Plugin fs.read denied: path traversal outside workspace'
            };
        }

        if (!fs.existsSync(requestedPath)) {
            return {
                success: false,
                message: 'Plugin fs.read denied: file does not exist'
            };
        }

        if (!fs.statSync(requestedPath).isFile()) {
            return {
                success: false,
                message: 'Plugin fs.read denied: target is not a file'
            };
        }

        const content = fs.readFileSync(requestedPath, 'utf8');
        const preview = content.length > ReadOnlyFilePluginAdapter.MAX_PREVIEW_CHARS
            ? `${content.slice(0, ReadOnlyFilePluginAdapter.MAX_PREVIEW_CHARS)}\n...[truncated]`
            : content;

        return {
            success: true,
            message: 'Plugin fs.read executed',
            data: {
                path: requestedPath,
                preview,
                bytes: Buffer.byteLength(content, 'utf8')
            }
        };
    }
}
