import { z } from 'zod';
import { resultOk, outcomeOk, outcomeFail, metaSince, brandId, domiaError, moduleId } from '@domia/contracts';
import type {
  AuditService, Dimension, LoopRunInternals, MetaToolHandler,
  ModuleResult, Outcome, ToolCall, ToolManifest, ToolOutput,
} from '@domia/contracts';
import { DIMENSIONS } from './dimensions.js';
import { toCoverage, toFindingDraft } from './draft.js';

const AUDIT = moduleId('audit');

const meta = () => metaSince(new Date().toISOString(), brandId<'TraceId'>('audit'), brandId<'SpanId'>('audit'));
const dimensionIds = DIMENSIONS.map((d) => d.id) as [Dimension, ...Dimension[]];

const findingSchema = z.object({
  dimension: z.enum(dimensionIds),
  check: z.string().describe('stable check id, e.g. "a11y.contrast.dark-theme"'),
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['blocker', 'serious', 'moderate', 'minor']),
  confidence: z.enum(['verified', 'probable', 'needs-human']).describe('verified = a machine proved it; probable = you judged it; needs-human = an expert must confirm'),
  source: z.enum(['fetch', 'axe', 'lighthouse', 'nuclei', 'differential', 'agent', 'human']),
  standards: z.array(z.string()).optional().describe('e.g. "WCAG 2.2 SC 1.4.3", "EN 301 549 9.1.4.3"'),
  where: z.object({
    url: z.string(),
    ref: z.string().optional(),
    template: z.string().optional(),
    journey: z.string().optional(),
    step: z.number().optional(),
    matrix: z.record(z.string()).optional().describe('theme/locale/viewport/network cell this was seen in'),
  }),
  reach: z.object({ affected: z.number(), sampled: z.number() }).optional(),
  remediation: z.object({
    summary: z.string(),
    effort: z.enum(['S', 'M', 'L']),
    impact: z.enum(['high', 'medium', 'low']),
    verification: z.string().describe('how someone proves the fix worked'),
    patch: z.object({ language: z.string(), snippet: z.string(), file: z.string().optional() }).optional(),
  }),
  evidenceArtifacts: z.array(z.string()).optional().describe('artifact ids you already captured, e.g. from a screenshot'),
  observed: z.string().optional().describe('verbatim proof (headers, snippet, tree fragment) — stored as an artifact'),
});

const coverageSchema = z.object({
  dimension: z.enum(dimensionIds),
  executed: z.number(),
  applicable: z.number(),
  notes: z.string().optional(),
});

/**
 * The audit belt. The persona decides which dimensions to attempt and when to stop;
 * these tools only record what was found, what was covered, and what it scores.
 */
export class AuditMetaHandler implements MetaToolHandler {
  constructor(private readonly service: AuditService) {}

  manifests(): readonly ToolManifest[] {
    return [
      {
        name: 'audit.dimensions',
        description: `List the audit dimensions with what each covers: ${DIMENSIONS.map((d) => d.id).join(', ')}. Call this first to plan coverage.`,
        parameters: z.object({}), output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
      {
        name: 'audit.sweep',
        description: 'Run the deterministic pass over an origin: fetches the expected files, the security headers and the served HTML, then records verified findings and coverage for files, seo, agentic, security, language and network. Cheap — do this before spending any judgement.',
        parameters: z.object({ url: z.string().optional().describe('defaults to the session target') }),
        output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
      {
        name: 'audit.finding',
        description: 'Record one finding. Every finding needs evidence (artifact ids, verbatim observation, or both) and a fix. Never record a judgement as "verified".',
        parameters: findingSchema, output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
      {
        name: 'audit.coverage',
        description: 'Declare how much of a dimension you actually checked. A dimension with no coverage is reported as "not assessed" rather than as a pass.',
        parameters: coverageSchema, output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
      {
        name: 'audit.score',
        description: 'Current score per dimension, with coverage and the verified/probable/needs-human split.',
        parameters: z.object({}), output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
      {
        name: 'audit.report',
        description: 'Render the report from everything recorded so far and save it as an artifact. Call this before you finish.',
        parameters: z.object({ target: z.string().optional() }), output: z.unknown(), capabilities: ['meta'], risk: 'safe',
      },
    ];
  }

  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    if (call.name === 'audit.dimensions') return ok({ dimensions: this.service.dimensions() });

    if (call.name === 'audit.sweep') {
      const url = typeof call.args['url'] === 'string' ? call.args['url'] : targetOf(run);
      const swept = await this.service.sweep(run.runId, url);
      return swept.isErr() ? fail(swept.error.message) : ok(swept.value);
    }

    if (call.name === 'audit.finding') {
      const parsed = findingSchema.safeParse(call.args);
      if (!parsed.success) return fail(parsed.error.message);
      const recorded = await this.service.record(run.runId, toFindingDraft(parsed.data));
      if (recorded.isErr()) return fail(recorded.error.message);
      const f = recorded.value;
      return ok({ recorded: f.id, dimension: f.dimension, severity: f.severity, evidence: f.evidence });
    }

    if (call.name === 'audit.coverage') {
      const parsed = coverageSchema.safeParse(call.args);
      if (!parsed.success) return fail(parsed.error.message);
      const coverage = toCoverage(parsed.data);
      const covered = this.service.cover(run.runId, parsed.data.dimension, coverage);
      return covered.isErr() ? fail(covered.error.message) : ok({ dimension: parsed.data.dimension, ...coverage });
    }

    if (call.name === 'audit.score') return ok(this.service.score(run.runId));

    if (call.name === 'audit.report') {
      const target = typeof call.args['target'] === 'string' ? call.args['target'] : targetOf(run);
      const report = await this.service.report(run.runId, target);
      if (report.isErr()) return fail(report.error.message);
      return ok({ artifact: report.value.artifact.id, score: report.value.score });
    }

    return fail(`unknown audit tool '${call.name}'`);
  }
}

function targetOf(run: LoopRunInternals): string {
  const target = run.session.target;
  return target.kind === 'web' ? target.url : target.kind;
}

function ok(value: unknown): ModuleResult<Outcome<ToolOutput>> {
  return resultOk(outcomeOk<ToolOutput>({ value }, meta()));
}

function fail(message: string): ModuleResult<Outcome<ToolOutput>> {
  return resultOk(outcomeFail<ToolOutput>('failed', domiaError(AUDIT, 'INVALID_ARGS', message), meta()));
}
