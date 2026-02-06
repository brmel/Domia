---
description: How to add a new LLM provider adapter
---

# Adding a New LLM Provider

This workflow guides you through adding support for a new LLM provider using @vercel/ai.

---

## Overview

New providers are added as **Infrastructure Adapters** implementing the `ILLMProvider` port using the [@vercel/ai](https://sdk.vercel.ai/) unified API.

---

## Step 1: Check if @vercel/ai Supports the Provider

// turbo
```bash
npm search @ai-sdk
```

Supported providers include:
- `@ai-sdk/anthropic` (Claude)
- `@ai-sdk/openai` (GPT-4, GPT-4o)
- `@ai-sdk/google` (Gemini)
- `@ai-sdk/mistral` (Mistral)
- `@ai-sdk/groq` (Groq)

---

## Step 2: Install the Provider Package

// turbo
```bash
npm install @ai-sdk/google  # Example for Google Gemini
```

---

## Step 3: Update the VercelAIAdapter

If using the unified adapter approach, just add the new provider:

```typescript
// src/infrastructure/adapters/llm/VercelAIAdapter.ts
import { injectable, inject } from 'tsyringe';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';  // Add import
import { ResultAsync } from 'neverthrow';

@injectable()
export class VercelAIAdapter implements ILLMProvider {
  constructor(@inject('LLMConfig') private config: LLMConfig) {}
  
  private getModel() {
    switch (this.config.provider) {
      case 'anthropic': 
        return anthropic(this.config.model);
      case 'openai': 
        return openai(this.config.model);
      case 'google':  // Add new case
        return google(this.config.model);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }
  
  generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
    return ResultAsync.fromPromise(
      generateText({
        model: this.getModel(),
        system: AGENT_SYSTEM_PROMPT,
        prompt: this.formatContext(context),
      }),
      (e) => new LLMError('generation_failed', String(e))
    ).andThen(response => this.parseAction(response.text));
  }
}
```

---

## Step 4: Update Configuration Schema

```typescript
// src/infrastructure/config/providers.ts

export type LLMProvider = 'anthropic' | 'openai' | 'google';  // Add to union

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;  // Optional if using env vars
}
```

---

## Step 5: Create Separate Adapter (Alternative)

For providers NOT supported by @vercel/ai (e.g., Ollama for local):

```typescript
// src/infrastructure/adapters/llm/OllamaAdapter.ts
import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ILLMProvider } from '@domain/ports/ILLMProvider';

@injectable()
export class OllamaAdapter implements ILLMProvider {
  readonly providerName = 'ollama';
  
  constructor(@inject('OllamaConfig') private config: OllamaConfig) {}
  
  generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
    return ResultAsync.fromPromise(
      fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model: this.config.model,
          prompt: this.formatContext(context),
        }),
      }).then(r => r.json()),
      (e) => new LLMError('ollama_error', String(e))
    ).andThen(response => this.parseAction(response.response));
  }
}
```

Register in DI container:

```typescript
// For local development with Ollama
container.register('ILLMProvider', { useClass: OllamaAdapter });
container.register('OllamaConfig', { 
  useValue: { baseUrl: 'http://localhost:11434', model: 'llama3.2' }
});
```

---

## Step 6: Write Tests

```typescript
// src/infrastructure/adapters/llm/VercelAIAdapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { VercelAIAdapter } from './VercelAIAdapter';

// Mock the ai package
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '{"action":"click","params":{"element_id":5}}'
  })
}));

describe('VercelAIAdapter', () => {
  it('should parse valid action response', async () => {
    const adapter = new VercelAIAdapter({ 
      provider: 'anthropic', 
      model: 'claude-3-5-sonnet' 
    });
    
    const result = await adapter.generateAction(mockContext);
    
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.type).toBe('click');
    }
  });
});
```

// turbo
```bash
npm run test -- --grep "VercelAIAdapter"
```

---

## Step 7: Update Settings UI

```tsx
// src/presentation/renderer/components/Settings/ProviderSelector.tsx
const providers = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT-4)' },
  { value: 'google', label: 'Google (Gemini)' },  // Add new
];
```

---

## Verification Checklist

- [ ] Provider package installed
- [ ] Adapter uses `ResultAsync.fromPromise()`, never throws
- [ ] `@injectable()` decorator applied
- [ ] Registered in DI container
- [ ] Config type updated
- [ ] Unit tests pass
- [ ] `npm run typecheck` passes
