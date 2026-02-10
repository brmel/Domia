import { StepTrace } from '@domain/ports/ITraceService';
import { ITraceExporter } from '../ITraceExporter';
import debug from 'debug';

export class DebugExporter implements ITraceExporter {
    public readonly name = 'DebugExporter';
    private logPerception = debug('domia:perception');
    private logReasoning = debug('domia:reasoning');
    private logAgent = debug('domia:agent');

    async export(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        const prefix = `[${runId}] Step ${stepNumber}:`;

        if (data.sensorData) {
            this.logPerception(`${prefix} Sensors: DOM=${data.sensorData.domCount}, ARIA=${data.sensorData.ariaPresent}, Vision=${data.sensorData.visionPresent}`);
        }

        if (data.agentInput) {
            this.logReasoning(`${prefix} AGENT INPUT: Goal="${data.agentInput.goal}" URL=${data.agentInput.currentUrl}`);
            if (data.agentInput.promptPreview) {
                this.logReasoning(`${prefix} PROMPT PREVIEW: ${data.agentInput.promptPreview}`);
            }
        }

        if (data.agentOutput) {
            this.logAgent(`${prefix} AGENT THOUGHT: ${data.agentOutput.thought}`);
            this.logAgent(`${prefix} ACTION: ${JSON.stringify(data.agentOutput.action)}`);
        }
    }
}
