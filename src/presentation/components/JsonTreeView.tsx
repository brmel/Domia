import ReactJson from 'react-json-view';

interface JsonTreeViewProps {
    data: unknown;
    name?: string;
}

export function JsonTreeView({ data, name }: JsonTreeViewProps) {
    if (!data) return <div className="text-gray-500 text-sm p-4">No data available</div>;

    return (
        <div className="json-tree-view text-xs font-mono bg-[#1e1e1e] p-4 rounded-lg overflow-auto h-full border border-gray-800">
            <ReactJson
                src={data}
                name={name ?? false}
                theme="twilight"
                collapsed={2}
                displayDataTypes={false}
                style={{ backgroundColor: 'transparent' }}
            />
        </div>
    );
}
