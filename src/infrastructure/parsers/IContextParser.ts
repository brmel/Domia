import { Page } from 'playwright';

export interface IContextParser<T> {
    parse(page: Page): Promise<T>;
}
