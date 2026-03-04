import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunTimelineView } from '@presentation/components/run/RunTimelineView';

describe('RunTimelineView', () => {
    it('renders only lifecycle event when no actions or checkpoints', () => {
        render(<RunTimelineView statusLabel="idle" actionTypes={[]} checkpoints={[]} replanningEvents={[]} />);
        expect(screen.getByText('Run Status')).toBeInTheDocument();
        expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('renders lifecycle status event', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={[]} checkpoints={[]} replanningEvents={[]} />);
        expect(screen.getByText('Run Status')).toBeInTheDocument();
        expect(screen.getByText('running')).toBeInTheDocument();
    });

    it('renders action events', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={['click', 'type']} checkpoints={[]} replanningEvents={[]} />);
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
            replanningEvents={[]}
        />);
        expect(screen.getByText('run_initialized')).toBeInTheDocument();
        expect(screen.queryByText('action_applied')).toBeNull();
    });

    it('renders replanning events', () => {
        render(<RunTimelineView
            statusLabel="running" actionTypes={[]} checkpoints={[]}
            replanningEvents={[{ status: 'success', trigger: 'drift', reason: 'page changed' } as never]}
        />);
        expect(screen.getByText('Replanning success')).toBeInTheDocument();
    });

    it('renders lane labels with correct casing', () => {
        render(<RunTimelineView statusLabel="running" actionTypes={['click']} checkpoints={[]} replanningEvents={[]} />);
        expect(screen.getByText('lifecycle')).toBeInTheDocument();
        expect(screen.getByText('action')).toBeInTheDocument();
    });
});
