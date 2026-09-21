# Domia

## The goal

Domia is an attempt to replace the human software tester. The idea is an agent that
opens an application the way a person does, works through real use cases, and reports
what it found — web pages and desktop apps today, mobile next. Everything is meant to
be swapped rather than rewritten: plugins, skills, model providers and platform drivers
all sit behind one interface.

I wrote up the thinking behind it on LinkedIn — [A concrete example of how AI will
replace software testers](https://www.linkedin.com/pulse/concrete-example-how-ai-replace-software-testers-tnv-mellah--9vbxe).

Domia is also a deliberate experiment in what generative AI and agents can build. Part
of the point was to find out how far an agent can carry a real codebase, where it does
well, and where a human still has to make the call.

## What it does

An LLM agent that drives real applications — web pages and Electron apps — to
accomplish what you ask. It looks at the accessibility tree, acts by reference,
observes the result, and keeps going until it finishes or asks you something.

One agentic loop: no hardcoded steps, no phases, no workflows to author. The agent
owns task structure; the system owns lifetimes, mediation and provenance.

- **Install a build** → [INSTALL.md](./INSTALL.md) (macOS · Windows · Linux · CLI)
- **Work in the repo** → [Dev/QUICKSTART.md](./Dev/QUICKSTART.md)
- **How it is built** → [Dev/README.md](./Dev/README.md) · architecture in
  [Dev/DESIGN.md](./Dev/DESIGN.md) · every design fix in
  [Dev/packages/DECISIONS.md](./Dev/packages/DECISIONS.md)

```sh
cd Dev && npm install
npx tsx packages/cli/src/index.ts doctor
npx tsx packages/cli/src/index.ts run "Click 'More information' and report the title" --url https://example.com
npm run app        # the desktop app
```

Status: **2.0.0-beta.1**. It runs, it is tested end to end against real browsers and a
real model, and it packages into an app. Still open before it is comfortable for
someone else: entering a model key from the desktop UI, error and empty states, and
signed builds with auto-update (those need a paid certificate).

Your runs stay on your machine. What the agent sees — page snapshots, extracted text,
screenshots it chooses to take — goes to **your** model provider so the model can pick
the next step. Domia sends nothing anywhere else.
