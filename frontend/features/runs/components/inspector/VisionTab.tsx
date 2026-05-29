import { EmptyState } from '@frontend/ui/EmptyState';
import { SectionBar } from './inspectorPrimitives';

export function VisionTab({ beforeScreenshots, currentScreenshots }: {
    beforeScreenshots: string[] | undefined;
    currentScreenshots: string[] | undefined;
}): JSX.Element {
    const hasBefore = beforeScreenshots && beforeScreenshots.length > 0;
    const hasCurrent = currentScreenshots && currentScreenshots.length > 0;

    if (!hasBefore && !hasCurrent) {
        return <EmptyState icon="📷" title="No screenshots" description="Visual capture was disabled or failed for this step." />;
    }

    return (
        <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col overflow-hidden">
                <SectionBar className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    Previous Step
                </SectionBar>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50/50">
                    {hasBefore ? (
                        <div className="space-y-4 w-full">
                            {beforeScreenshots.map((url, i) => (
                                <div key={i} className="relative rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-white">
                                    <img src={url} alt={`Previous step ${i + 1}`} className="w-full h-auto object-contain" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm italic">No previous step screenshot</div>
                    )}
                </div>
            </div>

            <div className="flex flex-col overflow-hidden">
                <SectionBar className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    Current Step
                </SectionBar>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50/50">
                    {hasCurrent ? (
                        <div className="space-y-4 w-full">
                            {currentScreenshots.map((url, i) => (
                                <div key={i} className="relative rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-white">
                                    <img src={url} alt={`Current step ${i + 1}`} className="w-full h-auto object-contain" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm italic">No screenshot for this step</div>
                    )}
                </div>
            </div>
        </div>
    );
}
