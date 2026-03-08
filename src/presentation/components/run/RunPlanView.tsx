import type { ReactElement } from 'react';
import { cn } from '../../utils';
import type { Plan } from '@domain/entities/Plan';

export function RunPlanView({ plan }: { plan: Plan | null }): ReactElement {
    return (
        <div className="space-y-4">
            {plan?.items?.map((item, i) => (
                <div key={i} className={cn(
                    "relative pl-6 py-1 transition-all",
                    item.status === 'active' ? "opacity-100" : "opacity-80"
                )}>
                    {i !== plan.items.length - 1 && (
                        <div className="absolute left-2.75 top-6 -bottom-4 w-0.5 bg-gray-100"></div>
                    )}

                    <div className={cn(
                        "absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 bg-white",
                        item.status === 'completed' ? "border-green-500 text-green-600" :
                            item.status === 'active' ? "border-blue-500 text-blue-600 ring-2 ring-blue-100" :
                                item.status === 'failed' ? "border-red-500 text-red-600" :
                                    "border-gray-200 text-gray-300"
                    )}>
                        {item.status === 'completed' && <span className="text-[10px] font-bold">✓</span>}
                        {item.status === 'failed' && <span className="text-[10px] font-bold">✕</span>}
                        {item.status === 'active' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>}
                        {item.status === 'pending' && <span className="text-[10px]">○</span>}
                    </div>

                    <div className={cn(
                        "text-sm",
                        item.status === 'active' ? "font-semibold text-gray-900" :
                            item.status === 'completed' ? "text-gray-500" :
                                "text-gray-400"
                    )}>
                        {item.description}
                    </div>
                    {item.status === 'failed' && item.error && (
                        <div className="mt-1 text-xs text-red-500 bg-red-50 p-2 rounded">
                            {item.error}
                        </div>
                    )}
                </div>
            ))}
            {!plan?.items?.length && (
                <div className="text-xs text-gray-500">No plan available yet for this run.</div>
            )}
        </div>
    );
}
