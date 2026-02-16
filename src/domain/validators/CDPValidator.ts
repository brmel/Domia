import { Result, ok, err } from 'neverthrow';

export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value: unknown
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class CDPValidator {
    static validateCDPUrl(url: string): Result<string, ValidationError> {
        if (!url || url.trim().length === 0) {
            return err(new ValidationError('CDP URL cannot be empty', 'cdpUrl', url));
        }

        const trimmedUrl = url.trim();

        try {
            const parsedUrl = new URL(trimmedUrl);
            
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                return err(new ValidationError(
                    'CDP URL must use http or https protocol',
                    'cdpUrl',
                    url
                ));
            }

            if (!parsedUrl.port) {
                return err(new ValidationError(
                    'CDP URL must include a port number',
                    'cdpUrl',
                    url
                ));
            }

            return ok(trimmedUrl);
        } catch (error) {
            return err(new ValidationError(
                `Invalid CDP URL format: ${error instanceof Error ? error.message : String(error)}`,
                'cdpUrl',
                url
            ));
        }
    }

    static validateTimeout(timeoutMs: number): Result<number, ValidationError> {
        if (!Number.isInteger(timeoutMs)) {
            return err(new ValidationError('Timeout must be an integer', 'timeout', timeoutMs));
        }

        if (timeoutMs < 0) {
            return err(new ValidationError('Timeout cannot be negative', 'timeout', timeoutMs));
        }

        if (timeoutMs > 300000) {
            return err(new ValidationError('Timeout cannot exceed 300000ms (5 minutes)', 'timeout', timeoutMs));
        }

        return ok(timeoutMs);
    }

    static validateWindowId(windowId: string): Result<string, ValidationError> {
        if (!windowId || windowId.trim().length === 0) {
            return err(new ValidationError('Window ID cannot be empty', 'windowId', windowId));
        }

        const trimmed = windowId.trim();

        if (/[<>"'&]/.test(trimmed)) {
            return err(new ValidationError('Window ID contains invalid characters', 'windowId', windowId));
        }

        return ok(trimmed);
    }

    static validateMenuPath(menuPath: string): Result<string, ValidationError> {
        if (!menuPath || menuPath.trim().length === 0) {
            return err(new ValidationError('Menu path cannot be empty', 'menuPath', menuPath));
        }

        const trimmed = menuPath.trim();
        if (!trimmed.includes('>') && !trimmed.includes('/')) {
            return ok(trimmed);
        }

        const parts = trimmed.split(/[>/]/).map(p => p.trim());
        
        if (parts.some(part => part.length === 0)) {
            return err(new ValidationError('Menu path contains empty segments', 'menuPath', menuPath));
        }

        return ok(trimmed);
    }
}
