import { container } from 'tsyringe';
import { ConsoleViewHost } from '@infrastructure/adapters/view/ConsoleViewHost';

/**
 * Registers the CLI-specific IViewHost implementation.
 * Keeps infrastructure imports inside the composition layer.
 */
export function registerCliViewHost(): void {
    container.register('IViewHost', { useClass: ConsoleViewHost });
}
