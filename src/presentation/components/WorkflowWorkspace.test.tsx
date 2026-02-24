import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowWorkspace } from './WorkflowWorkspace';

vi.mock('../trpc', () => {
	const queryResult = (data: unknown): { data: unknown; isLoading: boolean; refetch: ReturnType<typeof vi.fn> } => ({
		data,
		isLoading: false,
		refetch: vi.fn(async () => undefined)
	});

	const mutationResult = (): { mutate: ReturnType<typeof vi.fn>; isPending: boolean } => ({
		mutate: vi.fn(),
		isPending: false
	});

	return {
		trpc: {
			workflow: {
				getDefinitions: {
					useQuery: vi.fn(() =>
						queryResult([
							{
								id: 'wf-1',
								name: 'Smoke Workflow',
								description: 'desc',
								status: 'draft',
								version: 1,
								platformConfig: { platform: 'web', url: 'https://example.com' },
								steps: [{ id: 's1', name: 'Step 1', prompt: 'do', continueOnFailure: false }],
								createdAt: '2026-01-01T00:00:00.000Z',
								updatedAt: '2026-01-01T00:00:00.000Z'
							}
						])
					)
				},
				getRuns: { useQuery: vi.fn(() => queryResult([])) },
				getRunDetails: { useQuery: vi.fn(() => queryResult(null)) },
				create: { useMutation: vi.fn(() => mutationResult()) },
				update: { useMutation: vi.fn(() => mutationResult()) },
				publish: { useMutation: vi.fn(() => mutationResult()) },
				createNextVersion: { useMutation: vi.fn(() => mutationResult()) },
				start: { useMutation: vi.fn(() => mutationResult()) },
				cancel: { useMutation: vi.fn(() => mutationResult()) },
				onUpdate: { useSubscription: vi.fn() }
			},
			history: {
				getRun: { useQuery: vi.fn(() => queryResult(null)) }
			},
			test: {
				getCheckpoints: { useQuery: vi.fn(() => queryResult([])) }
			}
		}
	};
});

describe('WorkflowWorkspace', () => {
	it('renders core workflow workspace controls and definitions panel', () => {
		const html = renderToStaticMarkup(<WorkflowWorkspace />);

		expect(html).toContain('Workflow Workspace');
		expect(html).toContain('Create Workflow');
		expect(html).toContain('Workflow Definitions');
		expect(html).toContain('Smoke Workflow');
	});
});
