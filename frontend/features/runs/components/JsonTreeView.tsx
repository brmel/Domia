import { useState } from 'react';

interface JsonTreeViewProps {
    data: unknown;
    name?: string;
}

const INDENT = 14;

function Primitive({ value }: { value: unknown }): JSX.Element {
    if (value === null) return <span className="text-gray-500">null</span>;
    switch (typeof value) {
        case 'string':
            return <span className="text-emerald-300">&quot;{value}&quot;</span>;
        case 'number':
            return <span className="text-amber-300">{value}</span>;
        case 'boolean':
            return <span className="text-purple-300">{String(value)}</span>;
        default:
            return <span className="text-gray-300">{String(value)}</span>;
    }
}

function Node({ label, value, depth }: { label?: string | undefined; value: unknown; depth: number }): JSX.Element {
    const isContainer = value !== null && typeof value === 'object';
    const [open, setOpen] = useState(depth < 2);

    if (!isContainer) {
        return (
            <div style={{ paddingLeft: depth * INDENT }} className="leading-relaxed">
                {label !== undefined && <span className="text-sky-300">{label}: </span>}
                <Primitive value={value} />
            </div>
        );
    }

    const entries = Array.isArray(value)
        ? value.map((v, i) => [String(i), v] as const)
        : Object.entries(value as Record<string, unknown>);
    const open2 = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

    return (
        <div style={{ paddingLeft: depth * INDENT }} className="leading-relaxed">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-left text-gray-300 hover:text-white focus:outline-none focus-visible:underline"
            >
                <span className="inline-block w-3 text-gray-500">{open ? '▾' : '▸'}</span>
                {label !== undefined && <span className="text-sky-300">{label}: </span>}
                <span className="text-gray-500">{open2[0]}</span>
                {!open && <span className="text-gray-600">{entries.length} {entries.length === 1 ? 'item' : 'items'}{open2[1]}</span>}
            </button>
            {open && (
                <>
                    {entries.map(([k, v]) => (
                        <Node key={k} label={k} value={v} depth={depth + 1} />
                    ))}
                    <div style={{ paddingLeft: depth * INDENT }} className="text-gray-500">{open2[1]}</div>
                </>
            )}
        </div>
    );
}

export function JsonTreeView({ data, name }: JsonTreeViewProps): JSX.Element {
    if (!data) return <div className="text-gray-500 text-sm p-4">No data available</div>;

    return (
        <div className="text-xs font-mono bg-neutral-900 text-gray-300 p-4 rounded-lg overflow-auto h-full border border-neutral-800">
            <Node label={name} value={data} depth={0} />
        </div>
    );
}
