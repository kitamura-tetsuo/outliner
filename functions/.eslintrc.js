module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    "max-len": ["warn", {
      code: 100,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
    }],
    indent: ["off", 2],
    "object-curly-spacing": ["error", "always"],
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    camelcase: "off",
    "no-unused-vars": "warn",
    "comma-dangle": ["error", "only-multiline"],

    // 🚫 禁止: svelte/store の直接利用
    "no-restricted-imports": ["error", {
      paths: [
        {
          name: "svelte/store",
          message: "use svelte5's rune. svelte/store is not permitted.",
        },
      ],
    }],
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
