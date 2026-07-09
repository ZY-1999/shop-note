/**
 * UI-project Jest setup (runs only under the jest-expo project via
 * `setupFilesAfterEnv`).
 *
 * cleanup() — unmount every tree renderWithProviders mounted, so a later test
 * never sees an earlier test's components (isolation, spec #03 AC4).
 *
 * NOTE on the "not configured to support act(...)" console.error you may see
 * from @tanstack/query-core's notifyManager: deliberately NOT silenced. React
 * Query v5 batches notifications via setTimeout; under React Native + RNTL,
 * setting IS_REACT_ACT_ENVIRONMENT=true (the usual web fix) makes React Query
 * wrap those notifications in `act`, which nests inside RNTL's own act() in
 * findByText/waitFor and deadlocks the first test. RNTL v14 manages act
 * internally via waitFor, so the update still flushes and assertions pass —
 * the warning is cosmetic here.
 *
 * Plain CJS (.js) so no transform is needed to read it.
 */
const { cleanup } = require("@testing-library/react-native");

afterEach(() => {
  cleanup();
});
