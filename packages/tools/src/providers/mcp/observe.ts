import type { Observation, AriaSnapshot } from '@domia/contracts';
import type { McpClient } from './client.js';

const SNAPSHOT_TOOL = 'browser_snapshot';

/** Parse playwright-mcp text output: URL/title inline, ARIA tree in ```yaml block. */
export function parseObservation(text: string, prevSnapshot: string | undefined): Observation {
  const url = text.match(/Page URL:\s*(.+)/)?.[1]?.trim();
  const title = text.match(/Page Title:\s*(.+)/)?.[1]?.trim();
  const yaml = text.match(/```yaml\n([\s\S]*?)```/)?.[1]?.trim();
  const snapText = yaml ?? '';
  const snapshot: AriaSnapshot = { kind: 'aria', text: snapText };
  return {
    snapshot,
    ...(url ? { url } : {}),
    ...(title ? { title } : {}),
    changedSinceLast: snapText !== (prevSnapshot ?? ''),
  };
}

/**
 * D17 — action tools return a file-link snapshot; browser_snapshot returns it
 * inline. So we always materialize the inline tree with one extra local call.
 */
export async function snapshotObservation(client: McpClient, prev: string | undefined): Promise<Observation | undefined> {
  const r = await client.callToolText(SNAPSHOT_TOOL, {});
  if (r.isErr()) return undefined;
  return parseObservation(r.value, prev);
}
