/**
 * Imported first by the CLI entry: ESM hoists imports, so suppression must be a
 * module side effect (a statement in index.ts would run after node:sqlite loads).
 * node:sqlite is experimental; its warning is noise for users, not actionable.
 */
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(w);
});

// The AI SDK logs provider spec-compatibility warnings on every call; we surface
// real provider errors ourselves through DomiaError, so this is pure noise.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;
