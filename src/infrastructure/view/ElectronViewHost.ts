import { injectable, inject } from 'tsyringe';
import { IViewHost, ViewOptions } from '@domain/ports';
import { AgentViewService } from '../electron/AgentViewService';

@injectable()
export class ElectronViewHost implements IViewHost {
    constructor(
        @inject(AgentViewService) private agentViewService: AgentViewService
    ) { }

    async show(options: ViewOptions): Promise<void> {
        this.agentViewService.show(options);
    }

    async hide(): Promise<void> {
        this.agentViewService.hide();
    }

    async getCDPWebSocketURL(): Promise<string> {
        return this.agentViewService.getCDPWebSocketURL();
    }
}
