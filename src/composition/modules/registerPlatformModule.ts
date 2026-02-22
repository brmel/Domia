import { container } from 'tsyringe';
import { PlaywrightAdapter } from '@infrastructure/adapters/browser';
import { WebDriver, ElectronDriver, AppDriverFactory } from '@infrastructure/adapters/drivers';

export function registerPlatformModule(): void {
    container.registerSingleton(PlaywrightAdapter);

    container.registerSingleton(WebDriver);
    container.registerSingleton(ElectronDriver);
    container.registerSingleton(AppDriverFactory);
    container.register('IAppDriverFactory', { useToken: AppDriverFactory });
}
