"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string[];
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number; // in MB
  disabled?: boolean;
  className?: string;
}

interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress?: number;
  error?: string;
}

/**
 * Drag and drop file upload component
 */
export function DropZone({
  onFilesSelected,
  accept = ["image/*", "application/pdf"],
  multiple = true,
  maxFiles = 10,
  maxSize = 10, // 10MB
  disabled = false,
  className,
}: DropZoneProps) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      return isArabic
        ? `الملف يتجاوز الحد الأقصى (${maxSize}MB)`
        : `File exceeds max size (${maxSize}MB)`;
    }

    // Check file type
    const fileType = file.type;
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();

    const isAccepted = accept.some((type) => {
      if (type.startsWith(".")) {
        return fileExtension === type;
      }
      if (type.includes("*")) {
        const baseType = type.split("/")[0];
        return fileType.startsWith(baseType + "/");
      }
      return fileType === type;
    });

    if (!isAccepted) {
      return isArabic ? "نوع الملف غير مدعوم" : "File type not supported";
    }

    return null;
  };

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const newFiles = Array.from(fileList);

      // Check max files
      if (files.length + newFiles.length > maxFiles) {
        alert(
          isArabic
            ? `يمكنك رفع ${maxFiles} ملفات كحد أقصى`
            : `You can upload max ${maxFiles} files`
        );
        return;
      }

      // Validate and add files
      const validFiles: UploadedFile[] = [];
      for (const file of newFiles) {
        const error = validateFile(file);
        validFiles.push({
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          file,
          status: error ? "error" : "pending",
          error: error ?? undefined,
        });
      }

      setFiles((prev) => [...prev, ...validFiles]);

      // Notify parent of valid files
      const selectedFiles = validFiles
        .filter((f) => f.status === "pending")
        .map((f) => f.file);
      if (selectedFiles.length > 0) {
        onFilesSelected(selectedFiles);
      }
    },
    [files.length, maxFiles, accept, maxSize, isArabic, onFilesSelected]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = ""; // Reset input
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all",
          isDragging
            ? "border-brand-500 bg-brand-500/5 scale-[1.02]"
            : "border-ink-200 hover:border-brand-500/40 hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800/50",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept.join(",")}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <Upload
          className={cn(
            "mx-auto size-12",
            isDragging ? "text-brand-500" : "text-ink-300"
          )}
        />

        <h3 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">
          {isDragging
            ? isArabic ? "أفلت الملفات هنا" : "Drop files here"
            : isArabic ? "اسحب وأفلت الملفات" : "Drag & drop files"}
        </h3>

        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {isArabic
            ? `أو انقر لاختيار الملفات (حد أقصى ${maxFiles} ملف، ${maxSize}MB)`
            : `or click to select files (max ${maxFiles} files, ${maxSize}MB)`}
        </p>

        <p className="mt-1 text-xs text-ink-400">
          {isArabic
            ? `الأنواع المدعومة: ${accept.join(", ")}`
            : `Accepted: ${accept.join(", ")}`}
        </p>
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {files.map((uploadedFile) => (
              <motion.div
                key={uploadedFile.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  uploadedFile.status === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
                )}
              >
                <File className="size-5 text-ink-400" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">
                    {uploadedFile.file.name}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {formatFileSize(uploadedFile.file.size)}
                  </p>
                </div>

                {uploadedFile.status === "error" && (
                  <AlertCircle className="size-5 text-red-500" />
                )}
                {uploadedFile.status === "success" && (
                  <CheckCircle className="size-5 text-emerald-500" />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(uploadedFile.id);
                  }}
                  className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
