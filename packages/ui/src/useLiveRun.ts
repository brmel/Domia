import { useEffect, useState } from 'react';
import type { RunEvent, RunId } from '@domia/contracts';
import { api } from './api.js';

type Terminal = Extract<RunEvent, { type: 'terminal' }>;
type Waiting = { question: string; kind: 'ask' | 'approval' | 'takeover' };

export interface LiveRunState {
  status: string;
  events: RunEvent[];
  waiting: Waiting | null;
  terminal: Terminal | null;
}

const initial: LiveRunState = { status: 'running', events: [], waiting: null, terminal: null };

function reduce(state: LiveRunState, event: RunEvent): LiveRunState {
  const events = [...state.events, event];
  switch (event.type) {
    case 'sync': return { ...state, events, status: (event.view as { status?: string }).status ?? state.status };
    case 'waiting_user': return { ...state, events, status: 'waiting_user', waiting: { question: event.question, kind: event.kind } };
    case 'terminal': return { ...state, events, status: event.status, terminal: event, waiting: null };
    default: return { ...state, events };
  }
}

export function useLiveRun(runId: RunId | null): LiveRunState {
  const [state, setState] = useState<LiveRunState>(initial);
  useEffect(() => {
    if (!runId) { setState(initial); return; }
    setState(initial);
    return api.runs.watch(runId, (event) => setState((prev) => reduce(prev, event)));
  }, [runId]);
  return state;
}
