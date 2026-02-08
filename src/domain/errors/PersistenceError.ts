export class PersistenceError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'PersistenceError';
    }
}
