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
    plugins: ['@typescript-eslint', 'import'],
    settings: {
        'import/resolver': {
            typescript: true,
            node: true,
        },
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

        // Import boundary rules
        'import/no-restricted-paths': ['error', {
            zones: [
                // Domain cannot import from other layers
                { target: './src/domain', from: './src/application', message: 'Domain cannot import from Application' },
                { target: './src/domain', from: './src/infrastructure', message: 'Domain cannot import from Infrastructure' },
                { target: './src/domain', from: './src/presentation', message: 'Domain cannot import from Presentation' },

                // Application cannot import from infrastructure/presentation
                { target: './src/application', from: './src/infrastructure', message: 'Application cannot import from Infrastructure' },
                { target: './src/application', from: './src/presentation', message: 'Application cannot import from Presentation' },

                // Infrastructure cannot import from application/presentation
                { target: './src/infrastructure', from: './src/application', message: 'Infrastructure cannot import from Application' },
                { target: './src/infrastructure', from: './src/presentation', message: 'Infrastructure cannot import from Presentation' },

                // Presentation cannot import from infrastructure
                { target: './src/presentation', from: './src/infrastructure', message: 'Presentation cannot import from Infrastructure' },
            ],
        }],
    },
    ignorePatterns: ['dist/**', 'dist-electron/**', 'node_modules/**'],
};
