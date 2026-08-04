import {
  cacheDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

import type { ExportJob } from "@/export/types";

/**
 * Build + write the export file to cache, then round-trip read to ensure the
 * on-disk xlsx is a complete workbook (catches truncated writes that leave
 * later sheets empty / weird row origins in mobile spreadsheet apps).
 * Sharing is intentionally separate so UI 「导出中」does not span the share sheet.
 */
export async function writeExportFile(job: ExportJob): Promise<string> {
  const content = await job.build();
  const directory = cacheDirectory ?? "";
  const uri = `${directory}${job.filename}`;
  const encoding =
    job.encoding === "base64" ? EncodingType.Base64 : EncodingType.UTF8;
  await writeAsStringAsync(uri, content, { encoding });

  if (job.encoding === "base64") {
    const roundtrip = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
    });
    if (roundtrip.length < content.length * 0.9) {
      throw new Error("导出文件写入不完整，请重试");
    }
    try {
      const wb = XLSX.read(roundtrip, { type: "base64" });
      if (wb.SheetNames.length === 0) {
        throw new Error("导出文件无 sheet");
      }
      for (const name of wb.SheetNames) {
        const ref = wb.Sheets[name]?.["!ref"];
        if (ref && !ref.startsWith("A1")) {
          throw new Error(`导出 sheet「${name}」未从 A1 起写（${ref}）`);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("导出")) throw err;
      throw new Error(
        `导出文件校验失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

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
