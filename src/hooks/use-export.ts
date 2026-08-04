import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";

import { shareExportFile, writeExportFile } from "@/export/run-export";
import type { ExportJob } from "@/export/types";

/**
 * Export mutation — `isPending` covers build + cache write only.
 * System share runs after pending clears so 「导出中」is not stuck on the share sheet.
 */
export function useExport(): UseMutationResult<string, Error, ExportJob> {
  return useMutation<string, Error, ExportJob>({
    mutationFn: async (job) => {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        throw new Error("Sharing is not available on this device");
      }
      const uri = await writeExportFile(job);
      void shareExportFile(uri, {
        mimeType: job.mimeType,
        dialogTitle: job.dialogTitle,
      });
      return uri;
    },
  });
}
