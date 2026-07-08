import { describe, it, expect } from 'vitest';
import { packBlob, unpackBlob, BLOB_VERSION } from '@infrastructure/persistence/blob';

describe('blob versioning', () => {
    it('round-trips data through the envelope', () => {
        const data = { steps: [{ kind: 'agent', prompt: 'go' }], nested: { n: 1 } };
        expect(unpackBlob(packBlob(data))).toEqual(data);
        expect(JSON.parse(packBlob(data)).v).toBe(BLOB_VERSION);
    });

    it('reads bare blobs written before the envelope existed', () => {
        expect(unpackBlob(JSON.stringify({ status: 'acting', history: [] }))).toEqual({ status: 'acting', history: [] });
        expect(unpackBlob(JSON.stringify([1, 2, 3]))).toEqual([1, 2, 3]);
    });

    it('refuses blobs from a newer app version instead of corrupting state', () => {
        expect(() => unpackBlob(JSON.stringify({ v: BLOB_VERSION + 1, data: {} }))).toThrow(/newer/);
    });
});
