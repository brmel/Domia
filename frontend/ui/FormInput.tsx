import { cn } from '@frontend/lib/cn';

interface FormInputProps {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
}

const INPUT_BASE = "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all font-mono";
const INPUT_ERROR = "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20";
const INPUT_NORMAL = "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 hover:border-gray-400";

export function FormInput({
  label,
  optional,
  value,
  onChange,
  error,
  disabled,
  placeholder,
  hint,
  autoFocus,
}: FormInputProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
        {optional && <span className="text-gray-400"> (Optional)</span>}
      </label>
      <input
        className={cn(INPUT_BASE, error ? INPUT_ERROR : INPUT_NORMAL)}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
      {hint && !error && (
        <p className="text-xs text-gray-500 leading-tight">{hint}</p>
      )}
    </div>
  );
}
