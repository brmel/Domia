export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ModuleId = Brand<string, 'ModuleId'>;
export type ContextId = Brand<string, 'ContextId'>;
export type RunId = Brand<string, 'RunId'>;
export type CaseId = Brand<string, 'CaseId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type PersonaId = Brand<string, 'PersonaId'>;
export type CallId = Brand<string, 'CallId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type TraceId = Brand<string, 'TraceId'>;
export type SpanId = Brand<string, 'SpanId'>;
export type MemoryId = Brand<string, 'MemoryId'>;
export type ScheduleId = Brand<string, 'ScheduleId'>;
/** 'secret://gh-token' — a reference, never the value. */
export type SecretRef = Brand<string, 'SecretRef'>;
/** 'personas/lead' → <promptsDir>/personas/lead.md */
export type PromptRef = Brand<string, 'PromptRef'>;

export const brandId = <B extends string>(raw: string): Brand<string, B> => raw as Brand<string, B>;
export const moduleId = (raw: string): ModuleId => raw as ModuleId;
