import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { ICheckpointRepository } from '@domain/ports/persistence/ICheckpointRepository';
import type { IWorkflowRepository } from '@domain/ports/persistence/IWorkflowRepository';

export interface IPersistenceAdapter extends IRunRepository, ICheckpointRepository, IWorkflowRepository {}
