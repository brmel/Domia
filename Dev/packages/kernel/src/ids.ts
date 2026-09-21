import { customAlphabet } from 'nanoid';

/**
 * Alphanumeric only — deliberately excludes nanoid's default `-` and `_`.
 * An id beginning with `-` is parsed as a flag by CLIs (and is awkward in URLs
 * and shell args), which silently broke `domia <cmd> <id>` for ~2% of ids.
 */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function newId(size = 12): string {
  return customAlphabet(alphabet, size)();
}
