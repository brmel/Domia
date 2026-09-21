/** A framework-agnostic executable spec: the consumer maps cases onto it/test. */
export interface TestCase { readonly name: string; run(): Promise<void> }
export interface TestSuite { readonly name: string; readonly cases: readonly TestCase[] }

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`conformance: ${msg}`);
}

export const suite = (name: string, cases: readonly TestCase[]): TestSuite => ({ name, cases });
export const testCase = (name: string, run: () => Promise<void>): TestCase => ({ name, run });
