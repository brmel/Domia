module.exports = {
    root: true,
    env: {
        browser: true,
        es2022: true,
        node: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint'],
    rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],

        // `explicit-function-return-type` removed (was a permanent 'warn' limbo):
        // tsc strict mode already infers AND type-checks every return, so the rule
        // added only style noise — pedantic on thin query unwrappers and brittle on
        // React hooks' large inferred shapes. Safety is unchanged; signatures that
        // benefit from an explicit type still get one by convention.

        // Layer-boundary enforcement lives in scripts/check-architecture.mjs
        // (the canonical, CI-enforced guard — see CLAUDE.md). The previous
        // import/no-restricted-paths zones targeted a deleted ./src/* tree and
        // enforced nothing, so they were removed rather than left as dead config.
    },
    ignorePatterns: ['dist/**', 'dist-electron/**', 'node_modules/**'],
};
