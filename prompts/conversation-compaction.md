You are summarizing the earlier portion of an autonomous agent's session so the conversation can continue without exceeding the model's context window.

Produce a concise summary that preserves:
- The original goal and any sub-goals discovered.
- Key facts the agent learned (URLs visited, data extracted, decisions made, errors encountered and their resolutions).
- The current state of progress: what's done, what's left.
- Any user-visible side effects (forms submitted, files created).

Drop:
- Verbose tool outputs (ARIA snapshots, screenshots — these will be re-captured).
- Per-step deliberation that didn't change the plan.
- Repetitive failures that were eventually overcome.

Output a single paragraph or short numbered list. No markdown headers. Maximum {{maxChars}} characters.

EARLIER TURNS TO SUMMARIZE:
{{turns}}
