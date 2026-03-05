import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowWorkspace } from '@presentation/components/workflow/WorkflowWorkspace';

vi.mock('@presentation/trpc', () => {
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
			run: {
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

	it('renders workflow definition version and status badge', () => {
		const html = renderToStaticMarkup(<WorkflowWorkspace />);

		// The mock returns a workflow with version 1 and status 'draft'
		expect(html).toContain('v1');
		expect(html).toContain('draft');
	});

	it('renders workflow step count for each definition', () => {
		const html = renderToStaticMarkup(<WorkflowWorkspace />);

		// The component renders step indices as 'Step 1', 'Step 2', etc. in the editor
		expect(html).toContain('Step 1');
	});

	it('renders platform badge for each workflow definition', () => {
		const html = renderToStaticMarkup(<WorkflowWorkspace />);

		// The mock workflow uses platform 'web'
		expect(html.toLowerCase()).toContain('web');
	});
});
