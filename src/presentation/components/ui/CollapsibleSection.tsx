import { type ReactNode } from 'react';
import { cn } from '../../utils';

const BADGE_COLORS: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function CollapsibleSection({ title, badge, badgeColor = 'gray', defaultOpen = false, children }: {
    title: string;
    badge?: string;
    badgeColor?: string;
    defaultOpen?: boolean;
    children: ReactNode;
}): JSX.Element {
    return (
        <details open={defaultOpen || undefined} className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
            <summary className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors flex items-center gap-3 select-none">
                <svg className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>{title}</span>
                {badge && (
                    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", BADGE_COLORS[badgeColor] ?? BADGE_COLORS['gray'])}>
                        {badge}
                    </span>
                )}
            </summary>
            <div className="p-4">{children}</div>
        </details>
    );
}
