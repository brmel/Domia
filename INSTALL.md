# Install Domia

Builds are **unsigned** (no paid developer certificate), so each OS asks once
whether you trust them. Everything below is free.

## macOS

1. Download `Domia-<version>-mac-<arch>.dmg`, open it, drag **Domia** to Applications.
2. macOS will refuse the first launch ("Apple could not verify…"). Clear the download
   quarantine flag once:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Domia.app
   ```

   Then open it normally. (Right-click → Open works too, on some macOS versions.)

## Windows

Run `Domia-<version>-win-x64.exe`. SmartScreen shows "unrecognised app" →
**More info** → **Run anyway**.

## Linux

```sh
chmod +x Domia-<version>-linux-x86_64.AppImage
./Domia-<version>-linux-x86_64.AppImage
```

## CLI

```sh
tar -xzf domia-cli-<os>.tar.gz     # domia.mjs + prompts/ + the servers it spawns
node domia.mjs doctor
```

`doctor` prints what is missing. Put it on your PATH with a one-line wrapper if you
want a plain `domia` command.

## Before the first run

- **A model key.** Domia reads `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, or an OpenAI-compatible endpoint (`OPENAI_COMPATIBLE_BASE_URL`)
  from the environment or from `~/.domia/.env`:

  ```sh
  mkdir -p ~/.domia && echo 'GOOGLE_API_KEY=…' >> ~/.domia/.env
  ```

- **A browser for the agent to drive.** Domia drives Chromium through
  playwright-mcp. If `doctor` reports it missing:

  ```sh
  node node_modules/playwright-core/cli.js install chromium   # next to domia.mjs
  npx playwright install chromium                             # or, from a checkout
  ```

## Where your data lives

| What | Path |
|---|---|
| database, artifacts, memory | `~/.domia` (override with `DOMIA_DATA_DIR`) |
| model keys | `~/.domia/.env` or your environment |
| personas + skills | inside the install (override with `DOMIA_PROMPTS_DIR`) |

Nothing is uploaded anywhere by Domia itself. What the agent sees — page snapshots,
extracted text, screenshots it chooses to take — is sent to **your** model provider so
the model can decide the next step. Runs stay on your machine otherwise.
