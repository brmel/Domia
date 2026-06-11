import { Run } from '@domain/entities/Run';
import type { RunId, Url } from '@domain/value-objects';

type CreateRunParams = { id: RunId; url: Url; prompt: string; parentRunId?: RunId };

export function createRun(params: CreateRunParams): Run {
    return Run.create(params, new Date());
}

export function startRun(run: Run): Run {
    return Run.start(run, new Date())._unsafeUnwrap();
}

export function passRun(run: Run, summary: string): Run {
    return Run.pass(run, summary, new Date())._unsafeUnwrap();
}

export function finishRun(run: Run, summary: string, value?: unknown): Run {
    return Run.finish(run, summary, new Date(), value)._unsafeUnwrap();
}
