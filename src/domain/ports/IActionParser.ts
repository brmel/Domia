import { ResultAsync } from 'neverthrow';
import { AgentAction } from '../value-objects/AgentAction';
import { LLMError } from '../errors/LLMErrors';

/**
 * Strategy interface for parsing LLM responses into AgentActions.
 * Different implementations can handle different formats (JSON, XML, Custom, etc.)
 */
export interface IActionParser {
    parse(text: string): ResultAsync<AgentAction, LLMError>;
}
