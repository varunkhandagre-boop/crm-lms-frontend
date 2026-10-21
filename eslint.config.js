// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'functions/*'],
  },
  {
    // React Compiler "rules of React" checks (eslint-plugin-react-hooks 6). The
    // existing screens break them in ways that work fine at runtime (load
    // functions declared after the effect that calls them, setState inside
    // effects, small components declared inside a screen). The compiler just
    // skips optimising those components. Kept as warnings so real errors stand
    // out; fix them when a screen is reworked anyway.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/globals': 'warn',
    },
  },
]);
