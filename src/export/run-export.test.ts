import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const writeAsStringAsync = jest.fn(async () => undefined);
const shareAsync = jest.fn(async () => undefined);
const isAvailableAsync = jest.fn(async () => true);

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync,
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync,
  shareAsync,
}));

import { runExport } from "@/export/run-export";
import type { ExportJob } from "@/export/types";

function job(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    filename: "report.csv",
    mimeType: "text/csv",
    encoding: "utf8",
    build: () => "a,b\n1,2",
    ...overrides,
  };
}

describe("runExport", () => {
  beforeEach(() => {
    writeAsStringAsync.mockReset().mockResolvedValue(undefined);
    shareAsync.mockReset().mockResolvedValue(undefined);
    isAvailableAsync.mockReset().mockResolvedValue(true);
  });

  it("builds, writes cache, shares, and returns the file URI", async () => {
    const uri = await runExport(
      job({
        filename: "out.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        encoding: "base64",
        build: async () => "YmluYXJ5",
        dialogTitle: "导出",
      }),
    );

    expect(uri).toBe("file:///cache/out.xlsx");
    expect(writeAsStringAsync).toHaveBeenCalledWith(
      "file:///cache/out.xlsx",
      "YmluYXJ5",
      { encoding: "base64" },
    );
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/out.xlsx", {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "导出",
    });
  });

  it("does not throw when the user cancels sharing", async () => {
    shareAsync.mockRejectedValueOnce(new Error("User canceled sharing"));
    await expect(runExport(job())).resolves.toBe("file:///cache/report.csv");
  });

  it("rethrows when shareAsync rejects without User canceled", async () => {
    shareAsync.mockRejectedValueOnce(new Error("Share failed: no activity"));
    await expect(runExport(job())).rejects.toThrow("Share failed: no activity");
  });

  it("throws when sharing is unavailable and does not write", async () => {
    isAvailableAsync.mockResolvedValueOnce(false);
    await expect(runExport(job())).rejects.toThrow(/not available/i);
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("propagates build errors and does not write", async () => {
    await expect(
      runExport(job({ build: () => { throw new Error("build blew up"); } })),
    ).rejects.toThrow("build blew up");
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("throws when writing the cache file fails", async () => {
    writeAsStringAsync.mockRejectedValueOnce(new Error("disk full"));
    await expect(runExport(job())).rejects.toThrow("disk full");
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
