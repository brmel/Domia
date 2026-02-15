import React from 'react';

interface SectionBlockProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
}

export function SectionBlock({ title, children, className, contentClassName }: SectionBlockProps): React.ReactElement {
    return (
        <section className={className}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
            <div className={contentClassName ?? 'mt-2'}>{children}</div>
        </section>
    );
}
