// Type declarations for optional tesseract.js module
// This file suppresses TypeScript errors when tesseract.js is not installed

declare module "tesseract.js" {
  export function createWorker(langs: string): Promise<{
    recognize(image: File | Blob | string): Promise<{
      data: {
        text: string;
        confidence: number;
        words: {
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }[];
      };
    }>;
    terminate(): Promise<void>;
    onProgress: (callback: { progress: number }) => void;
  }>;
}
