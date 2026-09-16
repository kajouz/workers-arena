"use client";

import { useState, useRef } from "react";
import { Camera, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { capturePhoto, compressPhoto, type CaptureResult } from "@/lib/mobile/camera";
import { cn } from "@/lib/utils";

interface ProofPhotoCaptureProps {
  /** Called when photos are captured and ready. Receives compressed data URLs. */
  onPhotosReady: (photos: string[]) => void;
  /** Called when the user skips photo capture. */
  onSkip: () => void;
  /** Maximum number of photos (default 3). */
  maxPhotos?: number;
  /** Whether the capture is currently uploading. */
  uploading?: boolean;
}

/**
 * Proof-of-work photo capture — shown during booking completion.
 * Workers can take 1–3 photos of the completed job as evidence.
 * Photos are compressed client-side before upload.
 */
export function ProofPhotoCapture({
  onPhotosReady,
  onSkip,
  maxPhotos = 3,
  uploading = false,
}: ProofPhotoCaptureProps) {
  const [photos, setPhotos] = useState<CaptureResult[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (source: "camera" | "gallery") => {
    setError(null);
    try {
      const result = await capturePhoto({ source, quality: 85 });
      if (!result) return; // user cancelled

      setCompressing(true);
      const compressed = await compressPhoto(result.dataUrl, 800, 60);
      setPhotos((prev) => {
        if (prev.length >= maxPhotos) return prev;
        return [...prev, { ...result, dataUrl: compressed }];
      });
    } catch (e) {
      setError("Failed to capture photo. Please try again.");
    } finally {
      setCompressing(false);
    }
  };

  const handleRemove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    onPhotosReady(photos.map((p) => p.dataUrl));
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <Camera className="mx-auto h-8 w-8 text-brand-500" />
        <h3 className="mt-2 text-sm font-bold text-foreground">
          Add proof photos (optional)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Take {maxPhotos} photo{maxPhotos > 1 ? "s" : ""} of the completed work as evidence.
        </p>
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
              <img
                src={photo.dataUrl}
                alt={`Proof ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => handleRemove(i)}
                className="absolute top-1 right-1 p-0.5 bg-black/50 rounded-full text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* Placeholder slots */}
          {Array.from({ length: maxPhotos - photos.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center"
            >
              <Camera className="h-5 w-5 text-muted-foreground/40" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {/* Capture buttons */}
      {photos.length < maxPhotos && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => handleCapture("camera")}
            disabled={compressing || uploading}
          >
            {compressing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-1" />
            )}
            Camera
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => handleCapture("gallery")}
            disabled={compressing || uploading}
          >
            Gallery
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onSkip}
          disabled={uploading}
        >
          Skip
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={handleConfirm}
          disabled={photos.length === 0 || uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          Confirm ({photos.length})
        </Button>
      </div>
    </div>
  );
}
