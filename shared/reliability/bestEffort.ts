interface WarnLogger {
    warn(message: string): void;
}

export async function bestEffort<T>(logger: WarnLogger, label: string, op: () => Promise<T>): Promise<T | undefined> {
    try {
        return await op();
    } catch (error) {
        logger.warn(`[bestEffort] ${label}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
