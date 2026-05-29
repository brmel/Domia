import readline from 'readline';
import chalk from 'chalk';
import type { Ora } from 'ora';
import type { ExecutionController } from '@backend/ExecutionController';
import { RunState } from '@domain/enums';

export interface InteractiveControls {
    setup(): void;
    teardown(): void;
}

/**
 * Wires raw-mode TTY keyboard controls ([p] pause/resume, [s]/[q] stop, ctrl-c quit)
 * onto an ExecutionController. No-op when stdin is not a TTY.
 */
export function createInteractiveControls(
    controller: ExecutionController,
    spinner: Ora,
    log: (msg: string) => void,
): InteractiveControls {
    let keyHandler: ((str: string, key: readline.Key) => void) | null = null;
    let rawModeEnabled = false;

    const teardown = (): void => {
        if (keyHandler) {
            process.stdin.off('keypress', keyHandler);
            keyHandler = null;
        }
        if (rawModeEnabled && process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        if (process.stdin.isTTY) {
            process.stdin.pause();
        }
        rawModeEnabled = false;
    };

    const setup = (): void => {
        if (!process.stdin.isTTY) return;

        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        rawModeEnabled = true;

        log(chalk.gray('Controls: [p] pause/resume, [s] stop, [q] quit'));

        keyHandler = (_str: string, key: readline.Key): void => {
            if (key.ctrl && key.name === 'c') {
                teardown();
                spinner.stop();
                console.log(chalk.yellow('\nStopping agent...'));
                controller.stop();
                process.exit(0);
            }

            if (key.name === 'p') {
                if (controller.state === RunState.PAUSED) {
                    controller.resume();
                    console.log(chalk.cyan('\n⏯ Resumed'));
                } else {
                    controller.pause();
                    console.log(chalk.cyan('\n⏸ Paused'));
                }
            }

            if (key.name === 's' || key.name === 'q') {
                teardown();
                spinner.stop();
                console.log(chalk.yellow('\nStopping agent...'));
                controller.stop();
            }
        };

        process.stdin.on('keypress', keyHandler);
    };

    return { setup, teardown };
}
