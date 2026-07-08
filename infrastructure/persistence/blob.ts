export const BLOB_VERSION = 1;

interface BlobEnvelope {
    readonly v: number;
    readonly data: unknown;
}

function isEnvelope(value: unknown): value is BlobEnvelope {
    return typeof value === 'object' && value !== null && typeof (value as BlobEnvelope).v === 'number' && 'data' in value;
}

export function packBlob(data: unknown): string {
    return JSON.stringify({ v: BLOB_VERSION, data });
}

/** Reads a versioned blob; bare JSON written before the envelope existed passes through as-is. */
export function unpackBlob<T>(json: string): T {
    const parsed: unknown = JSON.parse(json);
    if (!isEnvelope(parsed)) return parsed as T;
    if (parsed.v > BLOB_VERSION) {
        throw new Error(`Stored blob is version ${parsed.v}, newer than this build supports (${BLOB_VERSION}). Update the app.`);
    }
    return parsed.data as T;
}
