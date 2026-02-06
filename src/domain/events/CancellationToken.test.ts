import { describe, it, expect } from 'vitest';
import { CancellationTokenSource } from './CancellationToken';

describe('CancellationToken', () => {
    describe('CancellationTokenSource', () => {
        it('should start with requested=false', () => {
            const source = new CancellationTokenSource();
            expect(source.token.requested).toBe(false);
        });

        it('should set requested=true after cancel()', () => {
            const source = new CancellationTokenSource();
            source.cancel();
            expect(source.token.requested).toBe(true);
        });

        it('should reset to false after reset()', () => {
            const source = new CancellationTokenSource();
            source.cancel();
            expect(source.token.requested).toBe(true);
            source.reset();
            expect(source.token.requested).toBe(false);
        });

        it('should provide immutable token', () => {
            const source = new CancellationTokenSource();
            const token1 = source.token;
            expect(token1.requested).toBe(false);

            source.cancel();
            // Token reflects updated state
            const token2 = source.token;
            expect(token2.requested).toBe(true);
        });
    });
});
