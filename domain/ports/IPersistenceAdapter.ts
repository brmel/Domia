import type { IRunRepository } from './IRunRepository';
import type { ICheckpointRepository } from './ICheckpointRepository';
import type { IWorkflowRepository } from './IWorkflowRepository';

export interface IPersistenceAdapter extends IRunRepository, ICheckpointRepository, IWorkflowRepository {}
