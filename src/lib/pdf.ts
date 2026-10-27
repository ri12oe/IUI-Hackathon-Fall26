import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Load each PDF once and reuse it for every page
const cache = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let doc = cache.get(url);
  if (!doc) {
    doc = pdfjs.getDocument(url).promise;
    cache.set(url, doc);
    doc.catch(() => cache.delete(url)); // allow a retry if loading failed
  }
  return doc;
}

export async function getPageCount(file: File): Promise<number> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}