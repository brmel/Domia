import { cn } from '../../../lib/utils';
import type { FieldRenderProps } from '../../config/platformRegistry';

export function WebPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const url = value?.url || '';

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
        Target URL
      </label>
      <div className="relative group">
        <input
          className={cn(
            "w-full px-4 py-3 bg-gray-50 border-2 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-all font-medium font-mono",
            errors['url']
              ? "border-red-100 focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
              : "border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 group-hover:bg-white group-hover:border-gray-100"
          )}
          type="text"
          placeholder="google.com"
          value={url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          disabled={disabled}
          autoFocus
        />
        {errors['url'] && (
          <span className="absolute right-3 top-3.5 text-xs text-red-500 font-bold">
            {errors['url']}
          </span>
        )}
      </div>
    </div>
  );
}
