import { BasePlugin, type BaseTool } from '@google/adk';
import type { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
import { ObservationProfile } from '@domain/value-objects';
import { ActionType } from '@domain/enums';

const TOOL_PROFILE_OVERRIDES: Record<string, ObservationProfile> = {
    [ActionType.WAIT]: ObservationProfile.LongWait,
    [ActionType.WAIT_FOR_CONDITION]: ObservationProfile.LongWait,
    [ActionType.WAIT_FOR_URL]: ObservationProfile.LongWait,
    [ActionType.WAIT_FOR_CHANGE]: ObservationProfile.QuickAction,
    [ActionType.START_RECORDING]: ObservationProfile.QuickAction,
    [ActionType.FINISH]: ObservationProfile.Off,
};

export class AutoProfileSelectorPlugin extends BasePlugin {
    constructor(
        private readonly coordinator: ObservationCoordinator,
        private readonly defaultProfile: ObservationProfile,
    ) {
        super('AutoProfileSelectorPlugin');
    }

    override async beforeToolCallback({ tool }: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: import('@google/adk').ToolContext }): Promise<Record<string, unknown> | undefined> {
        const target = TOOL_PROFILE_OVERRIDES[tool.name];
        if (target && this.coordinator.currentProfile() !== target) {
            await this.coordinator.setProfile(target);
        }
        return undefined;
    }

    override async afterToolCallback({ tool }: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: import('@google/adk').ToolContext; result: Record<string, unknown> }): Promise<Record<string, unknown> | undefined> {
        const target = TOOL_PROFILE_OVERRIDES[tool.name];
        if (target && target !== ObservationProfile.Off && this.coordinator.currentProfile() !== this.defaultProfile) {
            await this.coordinator.setProfile(this.defaultProfile);
        }
        return undefined;
    }
}
