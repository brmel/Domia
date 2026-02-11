import { Result, ok, err } from 'neverthrow';

/**
 * ValidationError
 * 
 * Custom error for validation failures
 */
export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value: any
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * CDPValidator
 * 
 * Validates CDP (Chrome DevTools Protocol) configuration parameters
 */
export class CDPValidator {
    /**
     * Validates a CDP URL
     * 
     * @param url - URL to  validate
     * @returns Result with validated URL or validation error
     */
    static validateCDPUrl(url: string): Result<string, ValidationError> {
        if (!url || url.trim().length === 0) {
            return err(new ValidationError('CDP URL cannot be empty', 'cdpUrl', url));
        }

        const trimmedUrl = url.trim();

        // Check if it's a valid HTTP/HTTPS URL
        try {
            const parsedUrl = new URL(trimmedUrl);
            
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                return err(new ValidationError(
                    'CDP URL must use http or https protocol',
                    'cdpUrl',
                    url
                ));
            }

            // Check if port is specified
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

    /**
     * Validates a connection timeout value
     * 
     * @param timeoutMs - Timeout in milliseconds
     * @returns Result with validated timeout or validation error
     */
    static validateTimeout(timeoutMs: number): Result<number, ValidationError> {
        if (!Number.isInteger(timeoutMs)) {
            return err(new ValidationError(
                'Timeout must be an integer',
                'timeout',
                timeoutMs
            ));
        }

        if (timeoutMs < 0) {
            return err(new ValidationError(
                'Timeout cannot be negative',
                'timeout',
                timeoutMs
            ));
        }

        if (timeoutMs > 300000) { // 5 minutes max
            return err(new ValidationError(
                'Timeout cannot exceed 300000ms (5 minutes)',
                'timeout',
                timeoutMs
            ));
        }

        return ok(timeoutMs);
    }

    /**
     * Validates a window ID format
     * 
     * @param windowId - Window ID to validate
     * @returns Result with validated window ID or validation error
     */
    static validateWindowId(windowId: string): Result<string, ValidationError> {
        if (!windowId || windowId.trim().length === 0) {
            return err(new ValidationError(
                'Window ID cannot be empty',
                'windowId',
                windowId
            ));
        }

        const trimmed = windowId.trim();

        // Window IDs should not contain dangerous characters
        if (/[<>\"'&]/.test(trimmed)) {
            return err(new ValidationError(
                'Window ID contains invalid characters',
                'windowId',
                windowId
            ));
        }

        return ok(trimmed);
    }

    /**
     * Validates a menu path (e.g., "File > Save")
     * 
     * @param menuPath - Menu path to validate
     * @returns Result with validated menu path or validation error
     */
    static validateMenuPath(menuPath: string): Result<string, ValidationError> {
        if (!menuPath || menuPath.trim().length === 0) {
            return err(new ValidationError(
                'Menu path cannot be empty',
                'menuPath',
                menuPath
            ));
        }

        const trimmed = menuPath.trim();

        // Check if it contains the separator
        if (!trimmed.includes('>') && !trimmed.includes('/')) {
            // Single menu item is okay
            return ok(trimmed);
        }

        // Validate format (Menu > Submenu > Action)
        const parts = trimmed.split(/[>/]/).map(p => p.trim());
        
        if (parts.some(part => part.length === 0)) {
            return err(new ValidationError(
                'Menu path contains empty segments',
                'menuPath',
                menuPath
            ));
        }

        return ok(trimmed);
    }
}
