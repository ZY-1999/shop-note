import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react-native";
import type { QueryClient } from "@tanstack/react-query";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { AppProviders, createQueryClient } from "@/app/providers";

/**
 * The RNTL test harness (ADR-0006): render a component tree under the real
 * providers backed by a REAL `InMemoryAdapter` (never a mocked Repos).
 *
 * Isolation (spec #03 AC4): when no `repos` / `queryClient` is passed, each call
 * builds a fresh `InMemoryAdapter` + fresh `QueryClient` — no state or cache
 * leaks between tests. A second test sees none of the first test's data.
 *
 * `seed` runs against the adapter before render, so tests can express their
 * fixture as "create this staff / product / record" through the same repo API
 * production uses — and the assertion then proves that data flows through React
 * Query to the screen.
 *
 * Returns `{ view, repos, queryClient }`. `view` is RNTL's own RenderResult —
 * use `view.findByText` / `view.findByTestId` for assertions (direct property
 * access on it is reliable; the object resists spreading/merging, so repos and
 * queryClient ride alongside rather than being attached to view). `repos` /
 * `queryClient` are the instances backing this render, for inspection or spying.
 */
export interface RenderWithProvidersResult {
  view: RenderResult;
  repos: Repos;
  queryClient: QueryClient;
}

export interface RenderWithProvidersOptions {
  repos?: Repos;
  queryClient?: QueryClient;
  seed?: (repos: Repos) => Promise<void>;
}

export async function renderWithProviders(
  ui: ReactElement,
  opts: RenderWithProvidersOptions = {},
): Promise<RenderWithProvidersResult> {
  const repos = opts.repos ?? setupRepos(new InMemoryAdapter());
  if (opts.seed) await opts.seed(repos);
  const queryClient = opts.queryClient ?? createQueryClient();
  // RNTL v14's `render` is async (it awaits the test renderer's commit inside
  // act), so we must await it — otherwise `view` is a Promise and its query
  // methods (findByText, …) are unreachable, and `screen` reports "render has
  // not been called".
  const view = await render(
    <AppProviders repos={repos} queryClient={queryClient}>
      {ui}
    </AppProviders>,
  );
  return { view, repos, queryClient };
}
