import { cn } from '../../lib/utils';
import { getAvailablePlatforms } from '../config/platformRegistry';
import type { PlatformType } from '../../domain/types/PlatformConfig';

interface PlatformSelectorProps {
  value: PlatformType;
  onChange: (platform: PlatformType) => void;
  disabled: boolean;
}

export function PlatformSelector({ value, onChange, disabled }: PlatformSelectorProps): React.ReactElement {
  const platforms = getAvailablePlatforms();

  return (
    <div className="flex flex-col gap-2 mb-4">
      <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
        Platform
      </label>
      <div className="grid grid-cols-2 gap-2">
        {platforms.map((platform) => (
          <button
            key={platform.type}
            type="button"
            onClick={() => onChange(platform.type)}
            disabled={disabled}
            className={cn(
              "flex flex-row items-center justify-center gap-2 p-2 rounded-xl border-2 transition-all",
              value === platform.type
                ? "bg-blue-50 border-blue-500 shadow-sm"
                : "bg-gray-50 border-transparent hover:bg-white hover:border-gray-200",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="text-lg leading-none">{platform.icon}</span>
            <span className="text-xs font-bold text-gray-900 leading-none">{platform.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
