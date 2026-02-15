import React from 'react';
import { cn } from '../../../lib/utils';

export interface SegmentedControlItem<T extends string> {
    value: T;
    label: string;
}

interface SegmentedControlProps<T extends string> {
    items: readonly SegmentedControlItem<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    itemClassName?: string;
    activeItemClassName?: string;
    fullWidth?: boolean;
}

export function SegmentedControl<T extends string>({
    items,
    value,
    onChange,
    className,
    itemClassName,
    activeItemClassName,
    fullWidth = false
}: SegmentedControlProps<T>): React.ReactElement {
    return (
        <div className={cn('flex items-center gap-1 rounded-md border border-gray-200 bg-gray-100 p-0.5', className)}>
            {items.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    onClick={() => onChange(item.value)}
                    className={cn(
                        'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        fullWidth && 'flex-1',
                        value === item.value
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700',
                        itemClassName,
                        value === item.value && activeItemClassName
                    )}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
