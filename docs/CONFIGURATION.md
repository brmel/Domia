# Configuration & Secrets

Environment, configuration, and secrets management.

---

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NODE_ENV` | No | `development` / `production` | `development` |
| `GOOGLE_API_KEY` | Yes | Google Gemini API key | — |
| `HEADLESS` | No | Run browser headless | `true` in prod |

---

## Secrets Management

**Never commit API keys.** Set `GOOGLE_API_KEY` in `.env` (gitignored).

---

## Configuration File

`domia.config.json` in the project root:

```json
{
  "headless": true,
  "viewport": { "width": 1280, "height": 800 },
  "ai": {
    "provider": "google",
    "model": "gemini-2.0-flash",
    "visionEnabled": false,
    "debugScreenshots": false
  },
  "limits": {
    "maxSteps": 20,
    "delayBetweenSteps": 1000
  }
}
```

---

## Environment Overrides

| Variable | Overrides |
|----------|-----------|
| `DOMIA_LLM_PROVIDER` | `ai.provider` |
| `DOMIA_LLM_MODEL` | `ai.model` |
| `DOMIA_LLM_API_KEY` | `ai.apiKey` |
| `DOMIA_LLM_BASE_URL` | `ai.baseUrl` |

---

## Development Setup

Create `.env` (gitignored):

```bash
GOOGLE_API_KEY=your-api-key-here
```

---

## Production

- API keys stored via environment variables or OS keychain
- No `.env` files in production
- Config validated at startup, app exits on invalid config
