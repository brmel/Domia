import { cn } from '../../../lib/utils';
import type { FieldRenderProps } from '../../config/platformRegistry';
import { useState } from 'react';
import type { ElectronConnection } from '../../../domain/types/PlatformConfig';

export function ElectronPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const connection: ElectronConnection = value?.connection || { type: 'cdp', cdpUrl: 'http://localhost:9222' };
  const [connectionType, setConnectionType] = useState<'cdp' | 'executable'>(connection.type);

  const handleTypeChange = (newType: 'cdp' | 'executable') => {
    setConnectionType(newType);
    if (newType === 'cdp') {
      onChange({
        ...value,
        connection: {
          type: 'cdp',
          cdpUrl: 'http://localhost:9222',
        }
      });
    } else {
      onChange({
        ...value,
        connection: {
          type: 'executable',
          executablePath: '',
        }
      });
    }
  };

  const updateConnection = (updates: Partial<ElectronConnection>) => {
    onChange({
      ...value,
      connection: { ...connection, ...updates }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Connection Type Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
          Connection Type
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('cdp')}
            disabled={disabled}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all",
              connectionType === 'cdp'
                ? "bg-blue-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            🔗 Remote Debug (CDP)
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('executable')}
            disabled={disabled}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all",
              connectionType === 'executable'
                ? "bg-blue-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            📦 Launch App
          </button>
        </div>
      </div>

      {/* CDP URL Input */}
      {connectionType === 'cdp' && connection.type === 'cdp' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
            Chrome DevTools Protocol URL
          </label>
          <input
            className={cn(
              "w-full px-4 py-3 bg-gray-50 border-2 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-all font-medium font-mono",
              errors['connection.cdpUrl']
                ? "border-red-100 focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
                : "border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:bg-white hover:border-gray-100"
            )}
            type="text"
            placeholder="http://localhost:9222"
            value={connection.cdpUrl}
            onChange={(e) => updateConnection({ cdpUrl: e.target.value })}
            disabled={disabled}
          />
          {errors['connection.cdpUrl'] && (
            <span className="text-xs text-red-500 pl-1">{errors['connection.cdpUrl']}</span>
          )}
          <p className="text-xs text-gray-500 pl-1">
            Launch your Electron app with <code className="bg-gray-100 px-1.5 py-0.5 rounded">--remote-debugging-port=9222</code>
          </p>
        </div>
      )}

      {/* Executable Path Input */}
      {connectionType === 'executable' && connection.type === 'executable' && (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
              Executable Path
            </label>
            <input
              className={cn(
                "w-full px-4 py-3 bg-gray-50 border-2 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-all font-medium font-mono",
                errors['connection.executablePath']
                  ? "border-red-100 focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
                  : "border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:bg-white hover:border-gray-100"
              )}
              type="text"
              placeholder="/Applications/YourApp.app or C:\Program Files\YourApp\app.exe"
              value={connection.executablePath}
              onChange={(e) => updateConnection({ executablePath: e.target.value })}
              disabled={disabled}
            />
            {errors['connection.executablePath'] && (
              <span className="text-xs text-red-500 pl-1">{errors['connection.executablePath']}</span>
            )}
          </div>

          {/* Launch Arguments (Optional) */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
              Launch Arguments <span className="text-gray-300">(Optional)</span>
            </label>
            <input
              className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium font-mono hover:bg-white hover:border-gray-100"
              type="text"
              placeholder="--debug --verbose"
              value={connection.launchArgs?.join(' ') || ''}
              onChange={(e) => {
                if (connection.type === 'executable') {
                  const args = e.target.value ? e.target.value.split(' ') : undefined;
                  onChange({
                    ...value,
                    connection: { ...connection, launchArgs: args }
                  });
                }
              }}
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 pl-1">
              Space-separated command line arguments
            </p>
          </div>
        </>
      )}

      {/* Window Title Filter (Optional for both) */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">
          Window Title Filter <span className="text-gray-300">(Optional)</span>
        </label>
        <input
          className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium hover:bg-white hover:border-gray-100"
          type="text"
          placeholder="App Title"
          value={connection.windowTitle || ''}
          onChange={(e) => {
            const title = e.target.value || undefined;
            onChange({
              ...value,
              connection: { ...connection, windowTitle: title }
            });
          }}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 pl-1">
          Target specific window by title (useful for multi-window apps)
        </p>
      </div>
    </div>
  );
}
