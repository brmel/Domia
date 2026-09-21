import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { ModelRef, ModelSpec, ModuleResult } from '@domia/contracts';

const AGENT = moduleId('agent');
const SYNTAX = "expected 'provider:model[,provider:model…]' (e.g. google:gemini-2.5-flash,openai:gpt-4o)";

export function parseModelRef(text: string): ModuleResult<ModelRef> {
  const separator = text.indexOf(':');
  if (separator <= 0 || separator === text.length - 1) {
    return resultErr(domiaError(AGENT, 'BAD_CONFIG', `invalid model '${text}'; ${SYNTAX}`));
  }
  return resultOk({ provider: text.slice(0, separator), model: text.slice(separator + 1) });
}

export function parseModelSpec(text: string): ModuleResult<ModelSpec> {
  const refs: ModelRef[] = [];
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const ref = parseModelRef(part);
    if (ref.isErr()) return resultErr(ref.error);
    refs.push(ref.value);
  }
  const first = refs[0];
  if (!first) return resultErr(domiaError(AGENT, 'BAD_CONFIG', `invalid model '${text}'; ${SYNTAX}`));
  return resultOk(refs.length === 1 ? first : { chain: refs });
}
