---
description: How to configure and extend the Gemini LLM adapter
---

# LLM Provider Configuration

Domia uses the **Google Gemini API** via the `@google/generative-ai` SDK for all LLM operations (action generation, evaluation, planning).

---

## Overview

The LLM layer implements two domain ports:
- `ILLMProvider` — generates actions, evaluations, and plans
- `IToolCallingProvider` — handles structured tool calling with function declarations

Both are implemented by `GeminiAdapter` and `GeminiToolCallingProvider` in `src/infrastructure/adapters/llm/`.

---

## Configuration

Set your Google API key in `.env`:

```
GOOGLE_API_KEY=your-api-key-here
```

Configure the model in `domia.config.json`:

```json
{
  "ai": {
    "provider": "google",
    "model": "gemini-2.0-flash",
    "visionEnabled": false
  }
}
```

---

## Architecture

```
src/infrastructure/adapters/llm/
├── GeminiAdapter.ts              # Implements ILLMProvider
├── GeminiToolCallingProvider.ts   # Implements IToolCallingProvider
├── GeminiModelFactory.ts         # Creates GenerativeModel instances
├── zodToGeminiSchema.ts          # Converts zod schemas → Gemini function declarations
├── LlmRuntimeConfigResolver.ts   # Resolves LLMConfig from config + env
├── ToolCallingFailurePolicy.ts    # Decides retry/fail on tool call failures
├── RuntimeRolloutGateService.ts   # SLO-based rollout gate
└── LLMPlanningUtils.ts           # Plan parsing utilities
```

---

## DI Registration

All LLM services are registered in `src/composition/modules/registerLlmModule.ts`:

```typescript
container.register('IToolCallingProvider', { useClass: GeminiToolCallingProvider });
container.register('ILLMProvider', { useClass: GeminiAdapter });
```

---

## Verification

```bash
npm run typecheck
npx vitest run
```
