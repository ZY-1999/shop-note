/**
 * Two-project Jest config (ADR-0006): the node-only data layer (ts-jest) runs
 * alongside the React-Native UI layer (jest-expo + RNTL).
 *
 * Splitting by project — rather than one universal preset — keeps the 12
 * data-layer suites in their fast node environment and adds the RN environment
 * only for UI tests. Each test file runs in its right environment by extension:
 * `*.test.ts` → data (node/ts-jest); `*.test.tsx` → ui (jest-expo). The data
 * layer is deliberately node-only (see its harness doc-comment); forcing it
 * through jest-expo's RN environment would be heavier for no gain.
 *
 * Plain .js (not .ts) so Jest 30 doesn't need ts-node to read it.
 */
// Order matters: `.css` must match BEFORE the `@/` catch-all (else `@/global.css`
// is rewritten to src/global.css and never stubbed → SyntaxError on the `:root` rule).
const moduleNameMapper = {
  "\\.css$": "<rootDir>/jest.css-stub.js",
  "^@/(.*)$": "<rootDir>/src/$1",
};

/** The data layer: pure TypeScript, exercised through repo APIs against the
 *  in-memory adapter — no React, no device. Mirrors the pre-UI config. */
const dataLayerProject = {
  displayName: "data",
  testEnvironment: "node",
  moduleNameMapper,
  transform: { "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }] },
  testMatch: ["<rootDir>/src/**/*.test.ts"],
};

/** The UI layer: React Native components via RNTL, in the jest-expo RN
 *  environment (babel-jest transform, RN module mocks, jsdom-ish env). */
const uiProject = {
  displayName: "ui",
  preset: "jest-expo",
  moduleNameMapper,
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest-setup.js"],
};

module.exports = {
  projects: [dataLayerProject, uiProject],
};
