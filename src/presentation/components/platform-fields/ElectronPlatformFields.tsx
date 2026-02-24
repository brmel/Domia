import { cn } from '../../utils';
import type { FieldRenderProps } from '../../config/platformRegistry';
import { SegmentedControl } from '../ui/SegmentedControl';
import type {
  ElectronConnection,
  ElectronPlatformConfig,
  ElectronCDPConnection,
  ElectronExecutableConnection,
} from '../../../domain/types/PlatformConfig';

export function ElectronPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const electronValue = value as Omit<ElectronPlatformConfig, 'platform'>;
  const connection: ElectronConnection = electronValue.connection || { type: 'cdp', cdpUrl: 'http://localhost:9222' };
  const connectionType: 'cdp' | 'executable' = connection.type;

  const handleTypeChange = (newType: 'cdp' | 'executable'): void => {
    if (newType === 'cdp') {
      onChange({
        ...electronValue,
        connection: {
          type: 'cdp',
          cdpUrl: 'http://localhost:9222',
        }
      });
    } else {
      onChange({
        ...electronValue,
        connection: {
          type: 'executable',
          executablePath: '',
        }
      });
    }
  };

  const updateCdpConnection = (updates: Partial<Omit<ElectronCDPConnection, 'type'>>): void => {
    if (connection.type !== 'cdp') {
      return;
    }

    const nextConnection: ElectronCDPConnection = {
      type: 'cdp',
      cdpUrl: updates.cdpUrl ?? connection.cdpUrl,
      ...(updates.windowTitle !== undefined
        ? { windowTitle: updates.windowTitle }
        : connection.windowTitle !== undefined
          ? { windowTitle: connection.windowTitle }
          : {}),
    };

    onChange({
      ...electronValue,
      connection: nextConnection,
    });
  };

  const updateExecutableConnection = (updates: Partial<Omit<ElectronExecutableConnection, 'type'>>): void => {
    if (connection.type !== 'executable') {
      return;
    }

    const nextConnection: ElectronExecutableConnection = {
      type: 'executable',
      executablePath: updates.executablePath ?? connection.executablePath,
      ...(updates.launchArgs !== undefined
        ? { launchArgs: updates.launchArgs }
        : connection.launchArgs !== undefined
          ? { launchArgs: connection.launchArgs }
          : {}),
      ...(updates.windowTitle !== undefined
        ? { windowTitle: updates.windowTitle }
        : connection.windowTitle !== undefined
          ? { windowTitle: connection.windowTitle }
          : {}),
    };

    onChange({
      ...electronValue,
      connection: nextConnection,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Connection Type Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Connection Type
        </label>
        <SegmentedControl
          items={[
            { value: 'cdp', label: '🔗 Remote Debug (CDP)' },
            { value: 'executable', label: '📦 Launch App' }
          ] as const}
          value={connectionType}
          onChange={handleTypeChange}
          fullWidth
          className={cn(disabled && 'opacity-50 pointer-events-none')}
          activeItemClassName="bg-blue-600 text-white"
        />
      </div>

      {/* CDP URL Input */}
      {connectionType === 'cdp' && connection.type === 'cdp' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Chrome DevTools Protocol URL
          </label>
          <input
            className={cn(
              "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all font-mono",
              errors['connection.cdpUrl']
                ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 hover:border-gray-400"
            )}
            type="text"
            placeholder="http://localhost:9222"
            value={connection.cdpUrl}
            onChange={(e) => updateCdpConnection({ cdpUrl: e.target.value })}
            disabled={disabled}
          />
          {errors['connection.cdpUrl'] && (
            <span className="text-xs text-red-500">{errors['connection.cdpUrl']}</span>
          )}
          <p className="text-xs text-gray-500 leading-tight">
            Launch with <code className="bg-gray-100 px-1 py-0 rounded">--remote-debugging-port=9222</code>
          </p>
        </div>
      )}

      {/* Executable Path Input */}
      {connectionType === 'executable' && connection.type === 'executable' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Executable Path
            </label>
            <input
              className={cn(
                "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all font-mono",
                errors['connection.executablePath']
                  ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 hover:border-gray-400"
              )}
              type="text"
              placeholder="/Applications/YourApp.app or C:\Program Files\YourApp\app.exe"
              value={connection.executablePath}
              onChange={(e) => updateExecutableConnection({ executablePath: e.target.value })}
              disabled={disabled}
            />
            {errors['connection.executablePath'] && (
              <span className="text-xs text-red-500">{errors['connection.executablePath']}</span>
            )}
          </div>

          {/* Launch Arguments (Optional) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Launch Arguments <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono hover:border-gray-400"
              type="text"
              placeholder="--debug --verbose"
              value={connection.launchArgs?.join(' ') || ''}
              onChange={(e) => {
                if (connection.type === 'executable') {
                  const args = e.target.value ? e.target.value.split(' ') : undefined;
                  if (args === undefined) {
                    onChange({
                      ...electronValue,
                      connection: {
                        type: 'executable',
                        executablePath: connection.executablePath,
                        ...(connection.windowTitle !== undefined ? { windowTitle: connection.windowTitle } : {}),
                      },
                    });
                  } else {
                    updateExecutableConnection({ launchArgs: args });
                  }
                }
              }}
              disabled={disabled}
            />
            <p className="text-xs text-gray-500">
              Space-separated command line arguments
            </p>
          </div>
        </>
      )}

      {/* Window Title Filter (Optional for both) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Window Title Filter <span className="text-gray-400">(Optional)</span>
        </label>
        <input
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all hover:border-gray-400"
          type="text"
          placeholder="App Title"
          value={connection.windowTitle || ''}
          onChange={(e) => {
            const title = e.target.value;
            if (connection.type === 'cdp') {
              updateCdpConnection({ windowTitle: title });
            } else {
              updateExecutableConnection({ windowTitle: title });
            }
          }}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 leading-tight">
          Target specific window by title (useful for multi-window apps)
        </p>
      </div>
    </div>
  );
}
