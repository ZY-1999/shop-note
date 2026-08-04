import {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { ExportJob } from "@/export/types";

/**
 * Run an export job: gate sharing → build → write cache → system share.
 * User cancel (`User canceled` in the error message) is swallowed; other
 * failures propagate. Cache files are not cleaned up (system-managed).
 */
export async function runExport(job: ExportJob): Promise<string> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Sharing is not available on this device");
  }

  const content = await job.build();
  const directory = cacheDirectory ?? "";
  const uri = `${directory}${job.filename}`;
  const encoding =
    job.encoding === "base64" ? EncodingType.Base64 : EncodingType.UTF8;

  await writeAsStringAsync(uri, content, { encoding });

  try {
    await Sharing.shareAsync(uri, {
      mimeType: job.mimeType,
      dialogTitle: job.dialogTitle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("User canceled")) {
      return uri;
    }
    throw err instanceof Error ? err : new Error(message);
  }

  return uri;
}
