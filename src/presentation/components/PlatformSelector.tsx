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
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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
              "flex flex-row items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all",
              value === platform.type
                ? "bg-blue-50 border-blue-500"
                : "bg-white border-gray-300 hover:border-gray-400",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="text-base leading-none">{platform.icon}</span>
            <span className="text-sm font-medium text-gray-900 leading-none">{platform.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
