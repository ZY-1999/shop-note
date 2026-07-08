/**
 * Data-layer test harness.
 *
 * The repository is the single test seam (PRD testing decision): pure-TS logic
 * exercised through its public API against the in-memory adapter — no device,
 * no expo-sqlite. Component/UI tests, when added, should adopt the jest-expo
 * preset separately; this config targets the node-only data layer.
 *
 * Plain .js (not .ts) so Jest 30 doesn't need ts-node to read it.
 * @type {import('jest').Config}
 */
const config = {
  testEnvironment: "node",
  // Resolve the `@/` path alias the same way tsconfig does (src/*).
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Transpile TS via ts-jest in transpile-only mode (fast, per-file, no
  // program/rootDir diagnostics). Strict type correctness is enforced by
  // `pnpm typecheck` (`tsc --noEmit`), not by Jest.
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
  testMatch: ["<rootDir>/src/**/*.test.ts"],
};

module.exports = config;
