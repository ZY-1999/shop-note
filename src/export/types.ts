export type ExportJob = {
  filename: string;
  mimeType: string;
  encoding: "base64" | "utf8";
  build: () => string | Promise<string>;
  dialogTitle?: string;
};
