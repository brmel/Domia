import { ResultAsync } from 'neverthrow';
import { CaptureError } from '@domain/errors';
import { Screenshot } from './Screenshot';

export interface IVisionSensor {
    /**
     * Captures a screenshot of the current viewport.
     */
    captureSnapshot(): ResultAsync<Screenshot, CaptureError>;

    /**
     * Analyzes the current view and returns a description or structured data.
     * This is future-proofing for multimodal capabilities.
     * @param prompt Optional prompt to guide the analysis
     */
    analyze?(prompt: string): ResultAsync<string, CaptureError>;
}
