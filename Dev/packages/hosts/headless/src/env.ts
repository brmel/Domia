import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { installCandidates } from './paths.js';

function envFilesNearestFirst(): readonly string[] {
  return [resolve(process.cwd(), '.env'), join(homedir(), '.domia', '.env'), ...installCandidates('.env')];
}

function readEnvFiles(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const path of envFilesNearestFirst()) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && m[1] && m[2] && values[m[1]] === undefined) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

export function loadEnvKeys(): void {
  const fromFile = readEnvFiles();
  const get = (k: string): string | undefined => process.env[k] ?? fromFile[k];

  const google = get('GOOGLE_GENERATIVE_AI_API_KEY') ?? get('GOOGLE_API_KEY') ?? get('GEMINI_API_KEY');
  if (google && !process.env['GOOGLE_GENERATIVE_AI_API_KEY']) process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = google;

  const anthropic = get('ANTHROPIC_API_KEY');
  if (anthropic && !process.env['ANTHROPIC_API_KEY']) process.env['ANTHROPIC_API_KEY'] = anthropic;

  // openai + openai-compatible (GitHub Models / Ollama / LM Studio / OpenRouter).
  for (const k of ['OPENAI_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY']) {
    const v = get(k);
    if (v && !process.env[k]) process.env[k] = v;
  }
}
