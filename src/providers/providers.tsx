import { createContext, useContext, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/toast";
import type { Repos } from "@/data/composition";
import { MutationQueue } from "@/hooks/mutation-queue";

/**
 * Composition root for the UI (ADR-0005): a React Context holds the `Repos`, and
 * this module owns the QueryClient + the write-serialization queue.
 *
 * Deliberate split (spec #03): this provider is adapter-agnostic and
 * synchronous — `repos` is a prop, already built. The production async-open /
 * splash / error wiring lives in #04's `AppProvider`, which opens ExpoSqlite,
 * builds the `Repos` via `setupRepos`, and renders `<AppProviders repos={…}>`.
 * Tests do the same with an InMemory `Repos`. One Context, two ways to populate
 * it — no test/prod seam drift.
 */

interface AppContextValue {
  repos: Repos;
  queue: MutationQueue;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Read the `Repos`. Throws if used outside <AppProviders> — same contract every consumer relies on. */
export function useRepos(): Repos {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useRepos() must be used within <AppProviders>");
  return ctx.repos;
}

/** Read the write-serialization gate (ADR-0005). Every mutation runs through it. */
export function useMutationQueue(): MutationQueue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useMutationQueue() must be used within <AppProviders>");
  return ctx.queue;
}

/** Inner provider — injects repos + queue. Kept as a named export so #04 can
 *  compose the same context without re-deriving it. */
export function ReposProvider({
  repos,
  queue,
  children,
}: {
  repos: Repos;
  queue: MutationQueue;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ repos, queue }), [repos, queue]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * QueryClient defaults for local-only data (ADR-0005). There is no remote source
 * to refetch from — a value is fresh until a local mutate invalidates it — so:
 * staleTime/gcTime Infinity (never evict, never mark stale), refetch on focus
 * and mount both off, retry off (a local read either works or throws; retries
 * can't help). This is what lets derived reads (inventory/dailyFlow) stay pure
 * + recomputed (ADR-0002) with no stale window.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: false,
      },
    },
  });
}

/** Top-level provider: QueryClient + Repos + serialization queue. */
export function AppProviders({
  repos,
  queryClient,
  children,
}: {
  repos: Repos;
  queryClient?: QueryClient;
  children: ReactNode;
}) {
  const client = useMemo(() => queryClient ?? createQueryClient(), [queryClient]);
  const queue = useMemo(() => new MutationQueue(), []);
  return (
    <QueryClientProvider client={client}>
      <ReposProvider repos={repos} queue={queue}>
        <ToastProvider>{children}</ToastProvider>
      </ReposProvider>
    </QueryClientProvider>
  );
}
