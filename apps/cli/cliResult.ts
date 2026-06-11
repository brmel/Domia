import chalk from 'chalk';
import type { Result } from 'neverthrow';

export function unwrapOr<T>(result: Result<T, Error>, context: string): T | null {
    if (result.isErr()) {
        console.error(chalk.red(`${context}: ${result.error.message}`));
        process.exitCode = 1;
        return null;
    }
    return result.value;
}
