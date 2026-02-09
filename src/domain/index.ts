/**
 * Domain Layer Public API
 */

export * from './errors';
export * from './value-objects';
// Explicitly export entities to avoid conflicts
export type { TestRun, TestRunStatus } from './entities';
export { TestRunFactory } from './entities';
export * from './ports';
export * from './events';
