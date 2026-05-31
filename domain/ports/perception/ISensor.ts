import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';

export interface ISensor<T> {
    readonly name: string;
    capture(source: IPerceptionSource): Promise<T>;
}
