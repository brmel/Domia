import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunPlanView } from '@presentation/components/run/RunPlanView';
import type { Plan } from '@domain/entities/Plan';

describe('RunPlanView', () => {
    it('renders empty state when plan is null', () => {
        render(<RunPlanView plan={null} />);
        expect(screen.getByText('No plan available yet for this run.')).toBeInTheDocument();
    });

    it('renders empty state when plan has no items', () => {
        const plan: Plan = {
            id: 'p1', goal: 'test', items: [], status: 'planning',
            createdAt: new Date(), updatedAt: new Date(),
        };
        render(<RunPlanView plan={plan} />);
        expect(screen.getByText('No plan available yet for this run.')).toBeInTheDocument();
    });

    it('renders plan items with correct descriptions', () => {
        const plan: Plan = {
            id: 'p1', goal: 'test', status: 'executing',
            createdAt: new Date(), updatedAt: new Date(),
            items: [
                { id: 'i1', description: 'Navigate to page', status: 'completed', type: 'general' },
                { id: 'i2', description: 'Click login', status: 'active', type: 'general' },
                { id: 'i3', description: 'Verify dashboard', status: 'pending', type: 'general' },
            ],
        };
        render(<RunPlanView plan={plan} />);
        expect(screen.getByText('Navigate to page')).toBeInTheDocument();
        expect(screen.getByText('Click login')).toBeInTheDocument();
        expect(screen.getByText('Verify dashboard')).toBeInTheDocument();
    });

    it('renders failed item with error message', () => {
        const plan: Plan = {
            id: 'p1', goal: 'test', status: 'failed',
            createdAt: new Date(), updatedAt: new Date(),
            items: [
                { id: 'i1', description: 'Find element', status: 'failed', type: 'general', error: 'Element not found' },
            ],
        };
        render(<RunPlanView plan={plan} />);
        expect(screen.getByText('Find element')).toBeInTheDocument();
        expect(screen.getByText('Element not found')).toBeInTheDocument();
    });
});
