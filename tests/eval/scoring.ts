/**
 * Scored-eval primitives (W17), adapted from Sherlock's field-type scoring. Pure
 * functions so the scoring logic is unit-tested offline; the full pipeline-vs-golden
 * harness that consumes them is `--live-ai`-gated (it needs a real LLM run).
 */
export type FieldKind = 'exact' | 'numeric' | 'semantic';

export interface FieldScore {
    readonly kind: FieldKind;
    readonly score: number; // 0..1
    readonly pass: boolean;
}

export const SEMANTIC_PASS_THRESHOLD = 0.6;

export function scoreExact(expected: string, actual: string): FieldScore {
    const score = expected.trim() === actual.trim() ? 1 : 0;
    return { kind: 'exact', score, pass: score === 1 };
}

export function scoreNumeric(expected: number, actual: number, epsilon = 1e-6): FieldScore {
    const pass = Math.abs(expected - actual) <= epsilon;
    return { kind: 'numeric', score: pass ? 1 : 0, pass };
}

/** ROUGE-L F-measure over whitespace tokens (longest-common-subsequence based). */
export function rougeLF1(expected: string, actual: string): number {
    const a = expected.toLowerCase().split(/\s+/).filter(Boolean);
    const b = actual.toLowerCase().split(/\s+/).filter(Boolean);
    if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;

    const lcs = longestCommonSubsequence(a, b);
    const precision = lcs / b.length;
    const recall = lcs / a.length;
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
}

export function scoreSemantic(expected: string, actual: string, threshold = SEMANTIC_PASS_THRESHOLD): FieldScore {
    const score = rougeLF1(expected, actual);
    return { kind: 'semantic', score, pass: score >= threshold };
}

function longestCommonSubsequence(a: readonly string[], b: readonly string[]): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            dp[i]![j] = a[i - 1] === b[j - 1]
                ? dp[i - 1]![j - 1]! + 1
                : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
        }
    }
    return dp[a.length]![b.length]!;
}
