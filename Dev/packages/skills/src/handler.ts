import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId, brandId, outcomeOk, outcomeFail, metaSince } from '@domia/contracts';
import type {
  LoopRunInternals, LoopRunView, MetaToolHandler, ModuleResult, Outcome, SkillCard, ToolCall, ToolManifest,
  ToolOutput,
} from '@domia/contracts';
import type { SkillServiceImpl } from './service.js';

const SKILLS = moduleId('skills');
const MAX_OFFERED = 3;

const meta = () => metaSince(new Date().toISOString(), brandId<'TraceId'>('skills'), brandId<'SpanId'>('skills'));

/**
 * Skills as a belt tool, registered from this package at EP.MetaTool — the loop
 * needs no knowledge of skills, which is the whole point of the extension point.
 *
 * Progressive disclosure in two stages: the manifest advertises only the *names
 * and descriptions* of skills relevant to this request; the body and recorded
 * steps arrive only when the agent actually uses one.
 */
export class SkillMetaHandler implements MetaToolHandler {
  constructor(private readonly service: SkillServiceImpl) {}

  manifests(view: LoopRunView): readonly ToolManifest[] {
    const offered = this.service.relevantSync(view.request, MAX_OFFERED);
    const tools: ToolManifest[] = [{
      name: 'skill.save',
      description: 'Save what you just did as a reusable skill for this kind of task. Records the state-changing steps of this run.',
      parameters: z.object({ name: z.string(), description: z.string(), tags: z.array(z.string()).optional() }),
      output: z.unknown(),
      capabilities: ['meta'],
      risk: 'safe',
    }];
    if (offered.length === 0) return tools;

    tools.unshift({
      name: 'skill.use',
      description: `Apply a known-good procedure for this kind of task. Available: ${offered.map((s) => `"${s.name}" (${s.description})`).join('; ')}.`,
      parameters: z.object({ name: z.string().describe('one of the skill names listed above') }),
      output: z.unknown(),
      capabilities: ['meta'],
      risk: 'guarded',
    });
    return tools;
  }

  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    if (call.name === 'skill.save') return this.save(call, run);
    if (call.name === 'skill.use') return this.use(call, run);
    return resultErr(domiaError(SKILLS, 'UNKNOWN_TOOL', `skills has no tool '${call.name}'`));
  }

  private async save(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const minted = await this.service.mint({
      name: String(call.args['name'] ?? ''),
      description: String(call.args['description'] ?? ''),
      fromRun: run.runId,
      ...(Array.isArray(call.args['tags']) ? { tags: (call.args['tags'] as string[]).map(String) } : {}),
    });
    if (minted.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', minted.error, meta()));
    return resultOk(outcomeOk<ToolOutput>({ value: { saved: minted.value.name, steps: minted.value.steps.length } }, meta()));
  }

  /**
   * Using a skill replays its recorded steps through the session — the same
   * mediated invoke path any tool call takes, so it is traced and policy-gated
   * like everything else. An instructional skill simply returns its body.
   */
  private async use(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const name = String(call.args['name'] ?? '');
    const card = await this.service.get(name);
    if (card.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', card.error, meta()));
    if (!card.value) {
      return resultOk(outcomeFail<ToolOutput>('failed', domiaError(SKILLS, 'NOT_FOUND', `no skill named '${name}'`), meta()));
    }
    const skill: SkillCard = card.value;
    if (skill.steps.length === 0) {
      return resultOk(outcomeOk<ToolOutput>({ value: { skill: skill.name, instructions: skill.body } }, meta()));
    }

    const applied: { tool: string; status: string }[] = [];
    let lastObservation: ToolOutput['observation'];
    for (const [i, step] of skill.steps.entries()) {
      const stepCall: ToolCall = { callId: brandId<'CallId'>(`${call.callId}-s${i}`), name: step.tool, args: step.args };
      const r = await run.session.invoke(stepCall);
      if (r.isErr()) { applied.push({ tool: step.tool, status: r.error.code }); break; }
      applied.push({ tool: step.tool, status: r.value.status });
      if (r.value.status !== 'ok') break; // a drifted recording stops here; the agent takes over
      if (r.value.value.observation) lastObservation = r.value.value.observation;
    }

    const allOk = applied.every((a) => a.status === 'ok');
    return resultOk(outcomeOk<ToolOutput>({
      value: { skill: skill.name, applied, completed: allOk, instructions: allOk ? undefined : skill.body },
      ...(lastObservation ? { observation: lastObservation } : {}),
    }, meta()));
  }
}
