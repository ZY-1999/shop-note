import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { runExport } from "@/export/run-export";
import type { ExportJob } from "@/export/types";

/**
 * Thin React Query wrapper around `runExport` — exposes `mutate` / `isPending`
 * / `error` for export buttons. Spec #02; no query-cache invalidation.
 */
export function useExport(): UseMutationResult<string, Error, ExportJob> {
  return useMutation<string, Error, ExportJob>({
    mutationFn: runExport,
  });
}
