const js = require("@eslint/js");
const googleConfig = require("eslint-config-google");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  js.configs.recommended,
  googleConfig,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
      },
    },
    rules: {
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      quotes: "off",
      "max-len": "off",
      indent: ["off", 2],
      "object-curly-spacing": "off",
      "require-jsdoc": "off",
      "valid-jsdoc": "off",
      camelcase: "off",
      "no-unused-vars": "warn",
      "comma-dangle": "off",

      // 🚫 Forbidden: Direct use of svelte/store
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "svelte/store",
            message: "use svelte5's rune. svelte/store is not permitted.",
          },
        ],
      }],
    },
  },
  {
    files: ["**/*.spec.*", "**/*.test.*"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
    rules: {},
  },
];
