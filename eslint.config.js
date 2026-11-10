const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const noCommentsRule = {
  meta: {
    type: 'suggestion',
    messages: {
      commentNotAllowed:
        'Comentários não são permitidos no código. Use nomes claros ou registre a explicação em docs/diario-desenvolvimento.md.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ loc: comment.loc, messageId: 'commentNotAllowed' });
        }
      },
    };
  },
};

const projectPlugin = {
  rules: {
    'no-comments': noCommentsRule,
  },
};

const coreForbiddenImports = [
  'react',
  'react/*',
  'react-native',
  'react-native/*',
  'react-native-*',
  'expo',
  'expo/*',
  'expo-*',
  '@expo/*',
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    plugins: { 'alert-drive': projectPlugin },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'alert-drive/no-comments': 'error',
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: coreForbiddenImports,
              message: 'O core deve ser TypeScript puro, sem React ou Expo.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No core o tempo deve vir do Clock injetado, não de Date.now().',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No core o tempo deve vir do Clock injetado, não de new Date().',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', Buffer: 'readonly' },
    },
  },
]);
