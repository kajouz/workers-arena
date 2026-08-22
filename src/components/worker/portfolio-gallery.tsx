"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Camera,
  Star,
  Grid,
  List,
} from "lucide-react";

interface PortfolioImage {
  id?: string;
  url?: string;
  thumbnail?: string;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  category?: string;
  beforeUrl?: string;
  afterUrl?: string;
  hue: number;
  rating?: number;
  createdAt?: string;
}

interface PortfolioGalleryProps {
  images: PortfolioImage[];
  workerName: string;
  workerNameAr?: string;
  locale?: "en" | "ar";
  maxDisplay?: number;
  showBeforeAfter?: boolean;
  className?: string;
}

/**
 * Worker portfolio gallery with lightbox and before/after comparison
 */
export function PortfolioGallery({
  images,
  workerName,
  workerNameAr,
  locale = "en",
  maxDisplay = 6,
  showBeforeAfter = true,
  className,
}: PortfolioGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<PortfolioImage | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [compareMode, setCompareMode] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);

  const displayImages = showAll ? images : images.slice(0, maxDisplay);
  const hasMore = images.length > maxDisplay;

  const handleImageClick = (image: PortfolioImage, index: number) => {
    setSelectedImage({ ...image, id: image.id || `img-${index}` });
    setCompareMode(!!image.beforeUrl && !!image.afterUrl);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderPosition(Number(e.target.value));
  };

  const navigateImage = (direction: "prev" | "next") => {
    if (!selectedImage) return;
    const currentIndex = images.findIndex((img) => img.id === selectedImage.id);
    const newIndex = direction === "next" 
      ? (currentIndex + 1) % images.length 
      : (currentIndex - 1 + images.length) % images.length;
    setSelectedImage(images[newIndex]);
    setCompareMode(!!images[newIndex].beforeUrl && !!images[newIndex].afterUrl);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {locale === "ar" ? "معرض الأعمال" : "Portfolio"}
          </h3>
          <span className="text-sm text-gray-500">({images.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-2 rounded-lg transition-colors",
              viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-2 rounded-lg transition-colors",
              viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {displayImages.map((image) => (
            <div
              key={image.id}
              onClick={() => handleImageClick(image, displayImages.indexOf(image))}
              className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all"
            >
              {/* Main image */}
              <div
                className="absolute inset-0 bg-gradient-to-br"
                style={{
                  background: `linear-gradient(135deg, hsl(${image.hue}, 70%, 90%) 0%, hsl(${image.hue}, 60%, 80%) 100%)`,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-12 h-12 text-white/50" />
                </div>
              </div>

              {/* Before/After indicator */}
              {showBeforeAfter && image.beforeUrl && image.afterUrl && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded-full">
                  Before/After
                </div>
              )}

              {/* Rating badge */}
              {image.rating && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">
                  <Star className="w-3 h-3 fill-current" />
                  {image.rating}
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Title */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                <p className="text-white text-sm font-medium truncate">
                  {locale === "ar" ? image.titleAr || image.title : image.title}
                </p>
              </div>
            </div>
          ))}

          {/* Show More button */}
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="text-2xl font-bold">+{images.length - maxDisplay}</span>
              <span className="text-sm">more</span>
            </button>
          )}
        </div>
      ) : (
        /* List view */
        <div className="space-y-3">
          {displayImages.map((image) => (
            <div
              key={image.id}
              onClick={() => handleImageClick(image, displayImages.indexOf(image))}
              className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div
                className="w-20 h-20 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, hsl(${image.hue}, 70%, 90%) 0%, hsl(${image.hue}, 60%, 80%) 100%)`,
                }}
              >
                <Camera className="w-8 h-8 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {locale === "ar" ? image.titleAr || image.title : image.title}
                </p>
                {image.description && (
                  <p className="text-sm text-gray-500 truncate">
                    {locale === "ar" ? image.descriptionAr || image.description : image.description}
                  </p>
                )}
                {image.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {image.category}
                  </span>
                )}
              </div>
              {image.rating && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="text-sm font-medium">{image.rating}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Navigation */}
          <button
            onClick={() => navigateImage("prev")}
            className="absolute left-4 text-white hover:text-gray-300 z-10"
          >
            <ChevronLeft className="w-12 h-12" />
          </button>
          <button
            onClick={() => navigateImage("next")}
            className="absolute right-4 text-white hover:text-gray-300 z-10"
          >
            <ChevronRight className="w-12 h-12" />
          </button>

          {/* Image content */}
          <div className="max-w-4xl max-h-[80vh] mx-4">
            {compareMode && selectedImage.beforeUrl && selectedImage.afterUrl ? (
              /* Before/After comparison */
              <div className="relative">
                <div className="relative overflow-hidden rounded-xl">
                  {/* After image (background) */}
                  <div className="w-full h-[60vh] flex items-center justify-center bg-gray-800">
                    <Camera className="w-24 h-24 text-gray-600" />
                  </div>
                  
                  {/* Before image (overlay with clip) */}
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-gray-700"
                    style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  >
                    <Camera className="w-24 h-24 text-gray-500" />
                  </div>

                  {/* Slider line */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <ChevronLeft className="w-4 h-4 text-gray-800" />
                      <ChevronRight className="w-4 h-4 text-gray-800" />
                    </div>
                  </div>

                  {/* Labels */}
                  <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
                    Before
                  </div>
                  <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
                    After
                  </div>
                </div>

                {/* Slider control */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={handleSliderChange}
                  className="w-full mt-4"
                />
              </div>
            ) : (
              /* Single image view */
              <div className="rounded-xl overflow-hidden">
                <div className="w-full h-[60vh] flex items-center justify-center bg-gray-800">
                  <Camera className="w-24 h-24 text-gray-600" />
                </div>
              </div>
            )}

            {/* Image info */}
            <div className="mt-4 text-center">
              <h3 className="text-xl font-semibold text-white">
                {locale === "ar" ? selectedImage.titleAr || selectedImage.title : selectedImage.title}
              </h3>
              {(selectedImage.description || selectedImage.descriptionAr) && (
                <p className="mt-2 text-gray-300">
                  {locale === "ar" 
                    ? selectedImage.descriptionAr || selectedImage.description 
                    : selectedImage.description || selectedImage.descriptionAr}
                </p>
              )}
              {selectedImage.rating && (
                <div className="flex items-center justify-center gap-1 mt-2 text-yellow-400">
                  <Star className="w-5 h-5 fill-current" />
                  <span className="font-medium">{selectedImage.rating}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Before/After comparison slider component
 */
export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  className,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* After image (background) */}
      <div className="w-full h-64 md:h-96 flex items-center justify-center bg-gray-200">
        <Camera className="w-16 h-16 text-gray-400" />
      </div>

      {/* Before image (overlay) */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-gray-300"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Camera className="w-16 h-16 text-gray-500" />
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
          <ChevronLeft className="w-5 h-5 text-gray-800" />
          <ChevronRight className="w-5 h-5 text-gray-800" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
        {beforeLabel}
      </div>
      <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
        {afterLabel}
      </div>

      {/* Slider control */}
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="absolute bottom-4 left-4 right-4 z-20"
      />
    </div>
  );
}
