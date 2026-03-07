import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunStateView } from '@presentation/components/run/RunStateView';
import { RunState } from '@domain/enums';

const defaults = {
    status: RunState.RUNNING,
    history: [],
    currentAction: null,
    summary: null,
    errorMessage: null,
};

describe('RunStateView', () => {
    it('renders run status', () => {
        render(<RunStateView {...defaults} />);
        expect(screen.getByText(RunState.RUNNING)).toBeInTheDocument();
    });

    it('renders history length', () => {
        render(<RunStateView {...defaults} history={[{ type: 'click' }, { type: 'type' }] as never} />);
        expect(screen.getByText('2 action(s)')).toBeInTheDocument();
    });

    it('renders current action type', () => {
        render(<RunStateView {...defaults} currentAction={{ type: 'scroll_down' } as never} />);
        expect(screen.getByText('scroll_down')).toBeInTheDocument();
    });

    it('renders summary when completed', () => {
        render(<RunStateView {...defaults} status={RunState.COMPLETED} summary="Task completed successfully" />);
        expect(screen.getByText('Task completed successfully')).toBeInTheDocument();
    });

    it('renders error message when failed', () => {
        render(<RunStateView {...defaults} status={RunState.FAILED} errorMessage="Timeout occurred" />);
        expect(screen.getByText('Timeout occurred')).toBeInTheDocument();
    });
});
