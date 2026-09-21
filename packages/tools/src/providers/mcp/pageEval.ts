import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult } from '@domia/contracts';
import type { McpClient } from './client.js';

const TOOLS = moduleId('tools');
const RESULT_SECTION = /### Result\n([\s\S]*?)(?:\n### |\s*$)/;

export async function playwrightEval(client: McpClient, code: string): Promise<ModuleResult<string>> {
  const r = await client.callToolText('browser_run_code_unsafe', { code });
  if (r.isErr()) return resultErr(r.error);
  const returned = RESULT_SECTION.exec(r.value)?.[1]?.trim();
  if (returned === undefined) return resultErr(domiaError(TOOLS, 'TOOL_FAILED', 'playwright eval returned no result section'));
  try {
    const decoded: unknown = JSON.parse(returned);
    return resultOk(typeof decoded === 'string' ? decoded : returned);
  } catch {
    return resultOk(returned);
  }
}
