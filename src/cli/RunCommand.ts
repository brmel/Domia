
import { Command } from 'commander';
import { container } from 'tsyringe';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import figlet from 'figlet';
import { RunTestUseCase } from '../application/use-cases';
import { CancellationTokenSource } from '../domain/events';
import { ConsoleViewHost } from '../infrastructure/adapters/view/ConsoleViewHost';

export class RunCommand {
    static register(program: Command) {
        program
            .command('run')
            .description('Start an autonomous test agent session')
            .option('-u, --url <url>', 'Target URL to test')
            .option('-p, --prompt <prompt>', 'Testing instruction')
            .option('-s, --steps <steps>', 'Max steps', '10')
            .option('-H, --no-headless', 'Run in headful mode (visible browser)', false)
            .action(async (options) => {
                console.log(chalk.cyan(figlet.textSync('Domia Agent', { horizontalLayout: 'full' })));

                // Ensure ViewHost is registered (it might be redundant if already registered in index, but safe)
                if (!container.isRegistered('IViewHost')) {
                    container.register('IViewHost', { useClass: ConsoleViewHost });
                }

                let { url, prompt, steps } = options;
                const { headless } = options;

                if (!url || !prompt) {
                    const answers = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'url',
                            message: 'Target URL:',
                            default: 'https://google.com',
                            when: !url,
                        },
                        {
                            type: 'input',
                            name: 'prompt',
                            message: 'What should the agent do?',
                            when: !prompt,
                        },
                        {
                            type: 'number',
                            name: 'steps',
                            message: 'Max steps:',
                            default: 10,
                            when: !steps,
                        }
                    ]);
                    url = url || answers.url;
                    prompt = prompt || answers.prompt;
                    steps = steps || answers.steps;
                }

                const spinner = ora('Initializing Agent...').start();

                try {
                    const useCase = container.resolve(RunTestUseCase);
                    const cancellation = new CancellationTokenSource();

                    // Handle Ctrl+C
                    process.on('SIGINT', () => {
                        spinner.stop();
                        console.log(chalk.yellow('\nStopping agent...'));
                        cancellation.cancel();
                        process.exit(0);
                    });

                    const input = {
                        url,
                        prompt,
                        options: {
                            maxSteps: parseInt(String(steps), 10),
                            headless: !!headless,
                        },
                    };

                    spinner.succeed(`Starting session on ${chalk.green(url)}`);
                    console.log(chalk.gray(`Goal: ${prompt}\n`));

                    const generator = useCase.execute(input, cancellation.token);

                    for await (const event of generator) {
                        switch (event.type) {
                            case 'started':
                                break;
                            case 'step_complete':
                                break;
                            case 'completed':
                                if (event.success) {
                                    console.log(chalk.green.bold('\n✔ Mission Accomplished!'));
                                    if (event.summary) console.log(chalk.green(event.summary));
                                } else {
                                    console.log(chalk.red.bold('\n✘ Mission Failed.'));
                                    if (event.summary) console.log(chalk.red(event.summary));
                                }
                                process.exit(event.success ? 0 : 1);
                                break;
                            case 'error':
                                console.log(chalk.red.bold(`\nError: ${event.error}`));
                                process.exit(1);
                                break;
                        }
                    }

                } catch (error) {
                    spinner.fail('Fatal Error');
                    console.error(error);
                    process.exit(1);
                }
            });
    }
}
