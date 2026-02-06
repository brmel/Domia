# Configuration & Secrets

Environment, configuration, and secrets management.

---

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | `development` / `production` | `development` |
| `ANTHROPIC_API_KEY` | Yes* | Claude API key | — |
| `OPENAI_API_KEY` | Yes* | OpenAI API key | — |
| `LLM_PROVIDER` | No | `anthropic` / `openai` | `anthropic` |
| `LLM_MODEL` | No | Model identifier | `claude-3-5-sonnet-20240620` |
| `HEADLESS` | No | Run browser headless | `true` in prod |
| `MAX_STEPS` | No | Max agent loop steps | `20` |

*At least one LLM API key required.

---

## Secrets Management

**Never commit API keys.** Use OS keychain via `keytar`.

```typescript
// src/infrastructure/config/secrets.ts
import keytar from 'keytar';

const SERVICE = 'auto-qa';

export const Secrets = {
  async getApiKey(provider: string): Promise<string | null> {
    return keytar.getPassword(SERVICE, `${provider}-api-key`);
  },
  
  async setApiKey(provider: string, key: string): Promise<void> {
    await keytar.setPassword(SERVICE, `${provider}-api-key`, key);
  },
  
  async deleteApiKey(provider: string): Promise<void> {
    await keytar.deletePassword(SERVICE, `${provider}-api-key`);
  }
};
```

---

## Configuration Schema

```typescript
// src/infrastructure/config/schema.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['anthropic', 'openai']).default('anthropic'),
    model: z.string().default('claude-3-5-sonnet-20240620'),
  }),
  browser: z.object({
    headless: z.boolean().default(process.env.NODE_ENV === 'production'),
    timeout: z.number().default(30000),
  }),
  agent: z.object({
    maxSteps: z.number().min(1).max(50).default(20),
  }),
  storage: z.object({
    dataDir: z.string().default(app.getPath('userData')),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
```

---

## Loading Configuration

```typescript
// src/infrastructure/config/loader.ts
import { Result, ok, err } from 'neverthrow';
import { ConfigSchema, Config } from './schema';

export function loadConfig(): Result<Config, ConfigError> {
  const raw = {
    llm: {
      provider: process.env.LLM_PROVIDER,
      model: process.env.LLM_MODEL,
    },
    browser: {
      headless: process.env.HEADLESS !== 'false',
    },
    agent: {
      maxSteps: parseInt(process.env.MAX_STEPS || '20'),
    },
  };
  
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success 
    ? ok(parsed.data) 
    : err(new ConfigError(parsed.error.message));
}
```

---

## Development Setup

Create `.env.local` (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
NODE_ENV=development
HEADLESS=false
```

---

## Production

- API keys stored in OS keychain (set via Settings UI)
- No `.env` files in production
- Config validated at startup, app exits on invalid config
