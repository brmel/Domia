import { Page } from 'playwright';

export interface ISensor<T> {
    readonly name: string;
    capture(page: Page): Promise<T>;
}
