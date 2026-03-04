import { injectable } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ISensor } from '@domain/ports/ISensor';

@injectable()
export class AriaSensor implements ISensor<string> {
    public readonly name = 'AriaSensor';

    async capture(source: IPerceptionSource): Promise<string> {
        await source.waitForContentReady(5000);
        return source.getAriaSnapshot().catch(() => '');
    }
}
