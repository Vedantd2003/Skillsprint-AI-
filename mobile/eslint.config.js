// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    rules: {
      // HTML-entity escaping is a web/DOM concern; apostrophes in React Native <Text> render correctly.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
