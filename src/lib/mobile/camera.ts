/**
 * Camera Module — proof-of-work photo capture
 *
 * Wraps @capacitor/camera for native (iOS/Android) and falls back to
 * an HTML file input for the web. Returns base64 data URLs that can be
 * uploaded to the server or stored in the booking's metadata.
 *
 * All Capacitor imports are dynamic so the web bundle tree-shakes them out.
 */

export interface CaptureResult {
  /** Base64 data URL (data:image/jpeg;base64,...). */
  dataUrl: string;
  /** Width of the captured image in pixels. */
  width: number;
  /** Height of the captured image in pixels. */
  height: number;
  /** File path (native) or null (web). */
  path: string | null;
}

export interface CaptureOptions {
  /** Maximum width in pixels (default 1200). */
  maxWidth?: number;
  /** Maximum height in pixels (default 900). */
  maxHeight?: number;
  /** JPEG quality 0-100 (default 80). */
  quality?: number;
  /** Source: camera or photo library. */
  source?: "camera" | "gallery";
}

const DEFAULTS: Required<CaptureOptions> = {
  maxWidth: 1200,
  maxHeight: 900,
  quality: 80,
  source: "camera",
};

/**
 * Capture a photo using the device camera (native) or file input (web).
 * Returns null if the user cancels.
 */
export async function capturePhoto(
  options: CaptureOptions = {}
): Promise<CaptureResult | null> {
  const opts = { ...DEFAULTS, ...options };

  // Try Capacitor camera first (native platforms).
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      return await captureNative(opts);
    }
  } catch {
    // Not in Capacitor — fall through to web.
  }

  // Web fallback: hidden file input.
  return await captureWeb(opts);
}

/** Native capture via @capacitor/camera. */
async function captureNative(opts: Required<CaptureOptions>): Promise<CaptureResult | null> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  const source = opts.source === "gallery" ? CameraSource.Photos : CameraSource.Camera;

  const photo = await Camera.getPhoto({
    quality: opts.quality,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source,
    width: opts.maxWidth,
    height: opts.maxHeight,
    correctOrientation: true,
  });

  if (!photo?.dataUrl) return null;

  // Parse dimensions from the data URL.
  const dims = await getImageDimensions(photo.dataUrl);

  return {
    dataUrl: photo.dataUrl,
    width: dims.width,
    height: dims.height,
    path: photo.path ?? null,
  };
}

/** Web capture via a temporary file input. */
async function captureWeb(opts: Required<CaptureOptions>): Promise<CaptureResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (opts.source === "camera") input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);

      if (!file) {
        resolve(null);
        return;
      }

      // Resize to max dimensions while preserving aspect ratio.
      const dataUrl = await resizeImage(file, opts.maxWidth, opts.maxHeight, opts.quality);
      const dims = await getImageDimensions(dataUrl);

      resolve({
        dataUrl,
        width: dims.width,
        height: dims.height,
        path: null,
      });
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve(null);
    });

    input.click();
  });
}

/** Resize an image file to fit within maxWidth × maxHeight. */
function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      let { width, height } = img;

      // Scale down to fit within bounds.
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality / 100));
    };

    img.src = url;
  });
}

/** Get image dimensions from a data URL. */
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = dataUrl;
  });
}

/**
 * Compress a base64 data URL to reduce upload size.
 * Returns a new data URL with reduced quality/dimensions.
 */
export async function compressPhoto(
  dataUrl: string,
  maxWidth = 800,
  quality = 60
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxWidth) {
        h = Math.round((h / w) * maxWidth);
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality / 100));
    };
    img.src = dataUrl;
  });
}
