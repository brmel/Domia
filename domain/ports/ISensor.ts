import type { IPerceptionSource } from './IPerceptionSource';

export interface ISensor<T> {
    readonly name: string;
    capture(source: IPerceptionSource): Promise<T>;
}
