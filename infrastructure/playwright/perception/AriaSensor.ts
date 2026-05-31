import { injectable } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';
import { ISensor } from '@domain/ports/perception/ISensor';
import { CONTENT_READY_TIMEOUT_MS } from '@shared/defaults';

@injectable()
export class AriaSensor implements ISensor<string> {
    public readonly name = 'AriaSensor';

    async capture(source: IPerceptionSource): Promise<string> {
        await source.waitForContentReady(CONTENT_READY_TIMEOUT_MS);
        return source.getAriaSnapshot();
    }
}
