import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunSafetyView } from '@presentation/components/run/RunSafetyView';

describe('RunSafetyView', () => {
    it('renders loading state', () => {
        render(<RunSafetyView isLoading isError={false} readinessSummary="" readinessMessage={undefined} policyFlags={[]} recentPolicyEvents={[]} />);
        expect(screen.getByText(/Loading readiness report/)).toBeInTheDocument();
    });

    it('renders error state', () => {
        render(<RunSafetyView isLoading={false} isError readinessSummary="" readinessMessage={undefined} policyFlags={[]} recentPolicyEvents={[]} />);
        expect(screen.getByText(/Could not load readiness report/)).toBeInTheDocument();
    });

    it('renders readiness gate info', () => {
        render(<RunSafetyView isLoading={false} isError={false} readinessSummary="strict (allowed)" readinessMessage="All gates passed" policyFlags={[]} recentPolicyEvents={[]} />);
        expect(screen.getByText('strict (allowed)')).toBeInTheDocument();
        expect(screen.getByText('All gates passed')).toBeInTheDocument();
    });

    it('renders policy flags', () => {
        render(<RunSafetyView
            isLoading={false} isError={false}
            readinessSummary="strict" readinessMessage={undefined}
            policyFlags={[
                { label: 'navigation', enabled: true },
                { label: 'download', enabled: false },
            ]}
            recentPolicyEvents={[]}
        />);
        expect(screen.getByText('navigation')).toBeInTheDocument();
        expect(screen.getByText('download')).toBeInTheDocument();
        expect(screen.getByText('Enabled')).toBeInTheDocument();
        expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('renders recent policy events with decisions', () => {
        render(<RunSafetyView
            isLoading={false} isError={false}
            readinessSummary="strict" readinessMessage={undefined}
            policyFlags={[]}
            recentPolicyEvents={[
                { id: '1', action: 'Navigate to URL', decision: 'allow' },
                { id: '2', action: 'Download file', decision: 'deny' },
            ]}
        />);
        expect(screen.getByText('Navigate to URL')).toBeInTheDocument();
        expect(screen.getByText('allow')).toBeInTheDocument();
        expect(screen.getByText('Download file')).toBeInTheDocument();
        expect(screen.getByText('deny')).toBeInTheDocument();
    });

    it('renders empty flags and events placeholders', () => {
        render(<RunSafetyView isLoading={false} isError={false} readinessSummary="" readinessMessage={undefined} policyFlags={[]} recentPolicyEvents={[]} />);
        expect(screen.getByText('No policy alignment records yet.')).toBeInTheDocument();
        expect(screen.getByText('No policy-relevant action events yet.')).toBeInTheDocument();
    });
});
