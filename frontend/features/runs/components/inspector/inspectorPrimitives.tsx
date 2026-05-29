import type { ReactNode } from 'react';
import { cn } from '@frontend/lib/cn';

export function TabPanel({ id, activeTab, overflow = true, children }: { id: string; activeTab: string; overflow?: boolean; children: ReactNode }): JSX.Element {
    return (
        <div className={cn("absolute inset-0 transition-opacity duration-300", overflow && "overflow-auto",
            activeTab === id ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
            {children}
        </div>
    );
}

export function SectionBar({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
    return <div className={cn("px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider", className)}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
    return <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{children}</div>;
}
