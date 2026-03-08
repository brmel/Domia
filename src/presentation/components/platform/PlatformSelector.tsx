import { cn } from '../../utils';
import { getAvailablePlatforms } from '../../config/platformRegistry';
import type { UIPlatformType } from '../../config/platformRegistry';
import { Button } from '../ui/Button';

interface PlatformSelectorProps {
  value: UIPlatformType;
  onChange: (platform: UIPlatformType) => void;
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
        {platforms.map((platform) => {
          const isUnavailable = platform.available === false;
          return (
            <div key={platform.type} className="relative">
              <Button
                type="button"
                onClick={() => !isUnavailable && onChange(platform.type as UIPlatformType)}
                disabled={disabled || isUnavailable}
                variant={value === platform.type ? 'primary' : 'secondary'}
                size="md"
                className={cn(
                  "w-full flex flex-row items-center justify-center gap-2",
                  (disabled || isUnavailable) && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="text-base leading-none">{platform.icon}</span>
                <span className="text-sm font-medium text-gray-900 leading-none">{platform.label}</span>
              </Button>
              {isUnavailable && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 leading-none pointer-events-none">
                  Coming soon
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
