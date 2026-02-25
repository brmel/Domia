import type { AgentAction } from '@domain/value-objects';

/**
 * Result of an agent step execution.
 * Returned when the agent's action loop terminates.
 */
export type StepExecutionResult =
    | { readonly success: true; readonly terminal: 'pass' }
    | {
          readonly success: false;
          readonly terminal: 'fail' | 'error' | 'max_actions';
          readonly code:
              | 'assertion_fail'
              | 'perception_error'
              | 'llm_error'
              | 'loop_detected'
              | 'action_execution_error'
              | 'agent_fail'
              | 'max_actions_reached';
          readonly reason: string;
      };

/**
 * Each action yielded by the agent runner during step execution.
 */
export interface AgentActionEvent {
    readonly type: 'action';
    readonly action: AgentAction;
    readonly assets?: Record<string, string>;
}

/**
 * Configuration for a single step execution.
 * Framework-agnostic: no ADK, Langchain, or other SDK types leak here.
 */
export interface StepRunnerConfig {
    readonly runId: string;
    readonly stepGoal: string;
    readonly url: string;
    readonly maxActions: number;
    readonly vision: boolean;
}

/**
 * Port interface for an AI agent runner.
 *
 * Abstracts the LLM agent framework (Google ADK, LangGraph, OpenAI Agents, etc.)
 * so the application layer has zero coupling to any specific SDK.
 *
 * Implementations receive browser automation and perception pipeline at construction
 * time (via DI or factory), keeping this interface purely about "run a step."
 */
export interface IAgentRunner {
    /**
     * Execute a single test step using an AI agent.
     *
     * The agent will:
     * 1. Observe the current page state (DOM, optional screenshot)
     * 2. Reason about the goal
     * 3. Take browser actions via tools
     * 4. Repeat until the goal is achieved, failed, or budget exhausted
     *
     * Yields `AgentActionEvent` for each action the agent takes.
     * Returns `StepExecutionResult` when the step terminates.
     */
    executeStep(
        config: StepRunnerConfig,
        browser: import('./IAppAutomation').IAppAutomation,
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown>;
}
