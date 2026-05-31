import { FieldLabel } from './FieldLabel';

/** Labeled integer input (parses to number on change). */
export function NumberField({ label, value, onChange, disabled }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}): React.ReactElement {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            />
        </div>
    );
}
