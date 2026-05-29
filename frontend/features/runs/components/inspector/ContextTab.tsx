import { EmptyState } from '@frontend/ui/EmptyState';
import { JsonTreeView } from '../JsonTreeView';
import { SectionBar } from './inspectorPrimitives';

export function ContextTab({ dom, accessibility }: {
    dom: Record<string, unknown> | undefined;
    accessibility: string | undefined;
}): JSX.Element {
    if (!dom && !accessibility) {
        return <EmptyState icon="🌳" title="No context data" description="DOM and accessibility data were not captured for this step." />;
    }

    return (
        <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col overflow-hidden bg-white">
                <SectionBar className="flex justify-between items-center">
                    <span>DOM Tree</span>
                    <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">PRE-ACTION</span>
                </SectionBar>
                <div className="flex-1 overflow-auto p-4">
                    {dom ? <JsonTreeView data={dom} name="DOM" /> : <div className="text-gray-400 text-sm italic">No DOM data</div>}
                </div>
            </div>
            <div className="flex flex-col overflow-hidden bg-white">
                <SectionBar className="flex justify-between items-center">
                    <span>Accessibility Tree</span>
                    <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">AX</span>
                </SectionBar>
                <div className="flex-1 overflow-auto p-4">
                    {accessibility ? <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{accessibility}</pre> : <div className="text-gray-400 text-sm italic">No ARIA data</div>}
                </div>
            </div>
        </div>
    );
}
