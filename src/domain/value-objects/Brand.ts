/**
 * Branded type utility
 * Creates nominal types from primitive types to prevent mixing
 */
declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };

// Re-export new Zod-based Value Objects
export type { Url } from './Url';
export { UrlFactory } from './Url';
export type { ElementId } from './ElementId';
export { ElementIdFactory } from './ElementId';

// Other Branded types (not yet migrated to Zod)
export type TestRunId = Brand<string, 'TestRunId'>;
export type Selector = Brand<string, 'Selector'>;
export type ArtifactPath = Brand<string, 'ArtifactPath'>;

// TestRunId factory
import { nanoid } from 'nanoid';

export const TestRunIdFactory = {
    create(): TestRunId {
        return nanoid() as TestRunId;
    },
    fromString(value: string): TestRunId {
        return value as TestRunId;
    },
};

// ArtifactPath factory
export const ArtifactPathFactory = {
    create(value: string): ArtifactPath {
        return value as ArtifactPath;
    },
};
