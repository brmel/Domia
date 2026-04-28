import { cn } from '@frontend/lib/cn';
import { getAvailablePlatforms } from '@frontend/lib/platformRegistry';
import type { UIPlatformType } from '@frontend/lib/platformRegistry';
import { Button } from '@frontend/ui/Button';

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
                {platforms.map((platform) => (
                    <Button
                        key={platform.type}
                        type="button"
                        onClick={() => onChange(platform.type as UIPlatformType)}
                        disabled={disabled}
                        variant={value === platform.type ? 'primary' : 'secondary'}
                        size="md"
                        className={cn('w-full flex flex-row items-center justify-center gap-2', disabled && 'opacity-50 cursor-not-allowed')}
                    >
                        <span className="text-base leading-none">{platform.icon}</span>
                        <span className="text-sm font-medium text-gray-900 leading-none">{platform.label}</span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
