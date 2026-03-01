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


}
