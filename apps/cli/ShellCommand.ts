import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import type { IShellPolicy } from '@domain/ports/automation/IShellPolicy';

export class ShellCommand {
    static register(program: Command): void {
        const shell = program.command('shell').description('Inspect the shell capability and its policy');

        shell.command('check <command>')
            .description('Evaluate a command against the shell policy without executing it')
            .option('--cwd <path>', 'Evaluate the command as if running from this working directory')
            .action((command: string, options: { cwd?: string }) => {
                const config = container.resolve<IConfigService>('IConfigService').get().plugins.shell;
                if (!config.enabled) {
                    console.log(chalk.yellow('Shell capability is disabled. Enable it in settings to allow shell tool calls.'));
                    process.exit(2);
                }

                const factory = container.resolve<() => IShellPolicy>('IShellPolicyFactory');
                const policy = factory();
                const decision = policy.evaluate(command, options.cwd);

                if (decision.allowed) {
                    console.log(chalk.green('ALLOWED'), chalk.dim(command));
                    process.exit(0);
                }
                console.log(chalk.red('DENIED'), chalk.dim(command));
                if (decision.reason) console.log(chalk.gray(`  reason: ${decision.reason}`));
                process.exit(1);
            });

        shell.command('status')
            .description('Show shell capability status and active policy')
            .action(() => {
                const config = container.resolve<IConfigService>('IConfigService').get().plugins.shell;
                console.log(chalk.bold('Shell capability:'), config.enabled ? chalk.green('enabled') : chalk.gray('disabled'));
                if (!config.enabled) return;
                const denyPatterns = config.denyPatterns ?? [];
                const allowedCwd = config.allowedCwd ?? [];
                console.log(chalk.bold('Deny patterns:'), denyPatterns.length === 0 ? chalk.dim('(none)') : '');
                for (const p of denyPatterns) console.log(chalk.gray(`  - ${p}`));
                console.log(chalk.bold('Allowed cwd:'), allowedCwd.length === 0 ? chalk.dim('(any)') : '');
                for (const p of allowedCwd) console.log(chalk.gray(`  - ${p}`));
            });
    }
}
