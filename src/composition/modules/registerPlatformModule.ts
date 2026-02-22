import { container } from 'tsyringe';
import { PlaywrightAdapter } from '@infrastructure/adapters/browser';
import {
    WebDriver,
    ElectronDriver,
    WebDriverProvider,
    ElectronDriverProvider,
    AppDriverFactory,
} from '@infrastructure/adapters/drivers';
import { PlatformSessionFactory } from '@application/services/platform/PlatformSessionFactory';

export function registerPlatformModule(): void {
    container.registerSingleton(PlaywrightAdapter);

    // Drivers (injected into providers)
    container.registerSingleton(WebDriver);
    container.registerSingleton(ElectronDriver);
    container.registerSingleton(PlatformSessionFactory);

    // Providers (each knows how to create a driver for its platform)
    container.registerSingleton(WebDriverProvider);
    container.registerSingleton(ElectronDriverProvider);

    // Factory (registry pattern — providers self-register)
    container.registerSingleton(AppDriverFactory);
    container.register('IAppDriverFactory', { useToken: AppDriverFactory });

    // Register built-in providers with the factory
    const factory = container.resolve(AppDriverFactory);
    factory.registerProvider(container.resolve(WebDriverProvider));
    factory.registerProvider(container.resolve(ElectronDriverProvider));
}
