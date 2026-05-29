import { useRef, useCallback } from 'react';
import { useStepInspectorStore } from '@frontend/features/runs/stepInspectorStore';
import { trpc } from '@frontend/api/trpc';
import { Button } from '@frontend/ui/Button';
import { InspectorContent } from './inspector/InspectorContent';

const QUERY_OPTS = { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } as const;

export function StepInspector(): JSX.Element | null {
    const { isOpen, runId, stepNumber, close } = useStepInspectorStore();
    const modalRef = useRef<HTMLDivElement>(null);

    const enabled = isOpen && !!runId && stepNumber !== null;

    const artifactsQuery = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled, ...QUERY_OPTS }
    );

    const prevArtifactsQuery = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: Math.max((stepNumber ?? 1) - 1, 0) },
        { enabled: enabled && (stepNumber ?? 0) > 1, ...QUERY_OPTS }
    );

    const stepDetailQuery = trpc.history.getStepDetail.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled, ...QUERY_OPTS }
    );

    const anyLoading = artifactsQuery.isLoading || stepDetailQuery.isLoading;
    const anyError = artifactsQuery.error ?? stepDetailQuery.error;

    const handleRetry = useCallback(() => {
        void artifactsQuery.refetch();
        void prevArtifactsQuery.refetch();
        void stepDetailQuery.refetch();
    }, [artifactsQuery, prevArtifactsQuery, stepDetailQuery]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={close}
            />

            <div
                ref={modalRef}
                className="relative w-full max-w-6xl h-[85vh] bg-white rounded-xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {stepNumber}
                        </div>
                        <div>
                            <h2 className="text-gray-900 font-semibold text-sm">Step Inspection</h2>
                            <p className="text-gray-500 text-xs font-mono">{runId?.slice(0, 8)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRetry}
                            className="text-xs text-gray-500 hover:text-gray-700"
                            title="Reload artifacts"
                        >
                            ↻
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={close}
                            className="rounded-full p-2"
                        >
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden bg-gray-50/50 relative">
                    {anyLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <span className="text-gray-500 font-medium text-sm animate-pulse">Retrieving artifacts...</span>
                        </div>
                    )}

                    {!anyLoading && anyError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <h3 className="text-red-900 font-bold mb-2">Failed to Load</h3>
                            <p className="text-red-600/80 max-w-md mb-4">{anyError.message}</p>
                            <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
                                Retry
                            </Button>
                        </div>
                    )}

                    {!anyLoading && !anyError && (
                        <InspectorContent
                            beforeArtifacts={prevArtifactsQuery.data ?? {}}
                            afterArtifacts={artifactsQuery.data ?? {}}
                            stepDetail={stepDetailQuery.data ?? undefined}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
