import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunTimelineView } from '@presentation/components/run/RunTimelineView';

describe('RunTimelineView', () => {
    it('renders only lifecycle event when no actions or checkpoints', () => {
        render(<RunTimelineView statusLabel="idle" actionTypes={[]} checkpoints={[]} />);
        expect(screen.getByText('Run Status')).toBeInTheDocument();
        expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('renders lifecycle status event', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={[]} checkpoints={[]} />);
        expect(screen.getByText('Run Status')).toBeInTheDocument();
        expect(screen.getByText('running')).toBeInTheDocument();
    });

    it('renders action events', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={['click', 'type']} checkpoints={[]} />);
        expect(screen.getByText('Action #1')).toBeInTheDocument();
        expect(screen.getByText('click')).toBeInTheDocument();
        expect(screen.getByText('Action #2')).toBeInTheDocument();
        expect(screen.getByText('type')).toBeInTheDocument();
    });

    it('renders checkpoint events (excluding action_applied)', () => {
        render(<RunTimelineView
            statusLabel="running" actionTypes={[]}
            checkpoints={[
                { id: 'c1', reason: 'run_initialized', detail: 'Run r1 started' },
                { id: 'c2', reason: 'action_applied', detail: 'Should be hidden' },
            ]}
        />);
        expect(screen.getByText('run_initialized')).toBeInTheDocument();
        expect(screen.queryByText('action_applied')).toBeNull();
    });

    it('renders lane labels with correct casing', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={['click']} checkpoints={[]} />);
        expect(screen.getByText('lifecycle')).toBeInTheDocument();
        expect(screen.getByText('action')).toBeInTheDocument();
    });
});
