/** Spreadsheet MIME for outbound xlsx share (staff / product exports). */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ExportJob = {
  filename: string;
  mimeType: string;
  encoding: "base64" | "utf8";
  build: () => string | Promise<string>;
  dialogTitle?: string;
};
