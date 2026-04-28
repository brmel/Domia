import React from 'react';

interface InfoCardProps {
    label: string;
    value: React.ReactNode;
    detail?: React.ReactNode;
}

export function InfoCard({ label, value, detail }: InfoCardProps): React.ReactElement {
    return (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="text-gray-500 uppercase tracking-wide text-[11px]">{label}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
            {detail ? <div className="mt-1 text-xs text-gray-600">{detail}</div> : null}
        </div>
    );
}
