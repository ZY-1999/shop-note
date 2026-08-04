import {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { ExportJob } from "@/export/types";

/**
 * Build + write the export file to cache. Sharing is intentionally separate so
 * UI 「导出中」does not span the system share sheet (cancel-share ≠ abort-build).
 */
export async function writeExportFile(job: ExportJob): Promise<string> {
  const content = await job.build();
  const directory = cacheDirectory ?? "";
  const uri = `${directory}${job.filename}`;
  const encoding =
    job.encoding === "base64" ? EncodingType.Base64 : EncodingType.UTF8;
  await writeAsStringAsync(uri, content, { encoding });
  return uri;
}

/**
 * Present the system share sheet for an already-written file.
 * User cancel (`User canceled` in the error message) is swallowed.
 */
export async function shareExportFile(
  uri: string,
  opts: { mimeType: string; dialogTitle?: string },
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Sharing is not available on this device");
  }
  try {
    await Sharing.shareAsync(uri, {
      mimeType: opts.mimeType,
      dialogTitle: opts.dialogTitle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("User canceled")) {
      return;
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Run an export job: gate sharing → build → write cache → system share.
 * Prefer {@link writeExportFile} + {@link shareExportFile} when the UI needs
 * pending to end before the share sheet opens.
 */
export async function runExport(job: ExportJob): Promise<string> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Sharing is not available on this device");
  }
  const uri = await writeExportFile(job);
  await shareExportFile(uri, {
    mimeType: job.mimeType,
    dialogTitle: job.dialogTitle,
  });
  return uri;
}
