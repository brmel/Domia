import { TestRunState } from '../enums/TestRunState';

export interface IExecutionController {
    readonly state: TestRunState;
    readonly currentPrompt: string | undefined;
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
    requestInput(prompt?: string): void;
    provideInput(input: string): void;
    waitForResume(): Promise<void>;
    waitForInput(): Promise<string>;
}
