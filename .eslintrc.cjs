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
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],

        // Layer-boundary enforcement lives in scripts/check-architecture.mjs
        // (the canonical, CI-enforced guard — see CLAUDE.md). The previous
        // import/no-restricted-paths zones targeted a deleted ./src/* tree and
        // enforced nothing, so they were removed rather than left as dead config.
    },
    ignorePatterns: ['dist/**', 'dist-electron/**', 'node_modules/**'],
};
