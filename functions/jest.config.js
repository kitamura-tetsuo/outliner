module.exports = {
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  collectCoverageFrom: [
    "index.js",
    "!**/node_modules/**",
    "!**/test/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testTimeout: 30000,
  verbose: true,
  // Firebase Functions テスト用の環境変数
  setupFiles: ["<rootDir>/test/env.js"],
};
