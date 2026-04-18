declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }>;
  export default pdfParse;
}
