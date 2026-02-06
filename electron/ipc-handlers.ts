import { ipcMain, BrowserWindow } from 'electron';
import { container } from '../src/composition-root';
import { RunTestUseCase } from '../src/application/use-cases';
import { CancellationTokenSource } from '../src/domain/events';
import type { TestRunEvent } from '../src/domain/events';

let currentCancellation: CancellationTokenSource | null = null;

/**
 * Register IPC handlers for test operations
 */
export function registerTestHandlers(win: BrowserWindow): void {
    // Run test - streams events to renderer
    ipcMain.handle('test:run', async (_event, input: unknown) => {
        const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
        currentCancellation = new CancellationTokenSource();

        try {
            const generator = useCase.execute(input, currentCancellation.token);

            for await (const event of generator) {
                // Intercept screenshot events to convert Buffer to Base64
                // This prevents Electron from serializing Buffer as { type: 'Buffer', data: [...] }
                if (event.type === 'screenshot') {
                    const base64Data = event.data.toString('base64');
                    // Send as a modified object where data is a string
                    win.webContents.send('test:update', {
                        ...event,
                        data: base64Data
                    });
                } else {
                    win.webContents.send('test:update', event);
                }
            }

            return { success: true };
        } catch (error) {
            const errorEvent: TestRunEvent = {
                type: 'error',
                error: { name: 'UnexpectedError', message: String(error), code: 'LLM_ERROR' } as never,
            };
            win.webContents.send('test:update', errorEvent);
            return { success: false, error: String(error) };
        } finally {
            currentCancellation = null;
        }
    });

    // Cancel running test
    ipcMain.handle('test:cancel', async () => {
        if (currentCancellation) {
            currentCancellation.cancel();
            return { success: true };
        }
        return { success: false, message: 'No test running' };
    });

    // Get test run by ID (placeholder)
    ipcMain.handle('test:get', async (_event, _id: string) => {
        return { success: false, message: 'Not implemented yet' };
    });

    // List test runs (placeholder)
    ipcMain.handle('test:list', async () => {
        return { success: false, message: 'Not implemented yet' };
    });
}

/**
 * Register IPC handlers for settings
 */
export function registerSettingsHandlers(): void {
    ipcMain.handle('settings:get', async () => {
        // Placeholder - return default settings
        return {
            llmProvider: 'anthropic',
            llmModel: 'claude-sonnet-4-20250514',
            headless: true,
            maxSteps: 20,
        };
    });

    ipcMain.handle('settings:set', async (_event, _settings: unknown) => {
        // Placeholder
        return { success: true };
    });
}
