"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Eye,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import {
  processImage,
  extractDocumentFields,
  classifyDocument,
  type DocumentType,
  type DocumentExtraction,
} from "@/lib/ocr/tesseract";

interface UploadedDocument {
  id: string;
  file: File;
  preview: string;
  status: "uploading" | "processing" | "verified" | "failed" | "pending";
  progress: number;
  extraction?: DocumentExtraction;
  error?: string;
}

interface DocumentVerifierProps {
  onVerificationComplete?: (documentId: string, extraction: DocumentExtraction) => void;
  onDocumentRemoved?: (documentId: string) => void;
  maxDocuments?: number;
  acceptedTypes?: string[];
  className?: string;
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, { en: string; ar: string }> = {
  national_id: { en: "National ID", ar: "بطاقة هوية وطنية" },
  passport: { en: "Passport", ar: "جواز سفر" },
  drivers_license: { en: "Driver's License", ar: "رخصة قيادة" },
  certificate: { en: "Certificate", ar: "شهادة" },
  commercial_register: { en: "Commercial Register", ar: "سجل تجاري" },
  unknown: { en: "Document", ar: "مستند" },
};

/**
 * Document upload and OCR verification component
 */
export function DocumentVerifier({
  onVerificationComplete,
  onDocumentRemoved,
  maxDocuments = 5,
  acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  className,
}: DocumentVerifierProps) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";

  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const generateId = () => `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const handleFileSelect = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      for (const file of fileArray.slice(0, maxDocuments - documents.length)) {
        const id = generateId();
        const preview = URL.createObjectURL(file);

        const newDoc: UploadedDocument = {
          id,
          file,
          preview,
          status: "processing",
          progress: 0,
        };

        setDocuments((prev) => [...prev, newDoc]);

        try {
          // Process with OCR
          const result = await processImage(file, {
            language: "eng+ara",
            onProgress: (progress) => {
              setDocuments((prev) =>
                prev.map((doc) =>
                  doc.id === id ? { ...doc, progress } : doc
                )
              );
            },
          });

          // Classify document type
          const documentType = classifyDocument(result.text);

          // Extract fields
          const extraction = extractDocumentFields(result.text, documentType);

          // Update document status
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === id
                ? {
                    ...doc,
                    status: extraction.confidence > 30 ? "verified" : "failed",
                    extraction,
                    progress: 100,
                    error:
                      extraction.confidence <= 30
                        ? "Could not extract enough information"
                        : undefined,
                  }
                : doc
            )
          );

          if (extraction.confidence > 30) {
            onVerificationComplete?.(id, extraction);
          }
        } catch (error) {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === id
                ? {
                    ...doc,
                    status: "failed",
                    error: String(error),
                    progress: 100,
                  }
                : doc
            )
          );
        }
      }
    },
    [documents.length, maxDocuments, onVerificationComplete]
  );

  const handleRemove = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      URL.revokeObjectURL(doc.preview);
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    onDocumentRemoved?.(id);
  };

  const handleRetry = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;

    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: "processing", progress: 0, error: undefined } : d
      )
    );

    try {
      const result = await processImage(doc.file, {
        language: "eng+ara",
        onProgress: (progress) => {
          setDocuments((prev) =>
            prev.map((d) => (d.id === id ? { ...d, progress } : d))
          );
        },
      });

      const documentType = classifyDocument(result.text);
      const extraction = extractDocumentFields(result.text, documentType);

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: extraction.confidence > 30 ? "verified" : "failed",
                extraction,
                progress: 100,
                error: extraction.confidence <= 30 ? "Low confidence" : undefined,
              }
            : d
        )
      );
    } catch (error) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: "failed", error: String(error), progress: 100 } : d
        )
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const getStatusIcon = (status: UploadedDocument["status"]) => {
    switch (status) {
      case "processing":
        return <Loader2 className="size-5 animate-spin text-brand-500" />;
      case "verified":
        return <CheckCircle className="size-5 text-emerald-500" />;
      case "failed":
        return <XCircle className="size-5 text-red-500" />;
      default:
        return <FileText className="size-5 text-ink-400" />;
    }
  };

  const getStatusBadge = (status: UploadedDocument["status"]) => {
    const variants = {
      uploading: "secondary",
      processing: "default",
      verified: "success",
      failed: "danger",
      pending: "outline",
    } as const;

    const labels = {
      uploading: isArabic ? "جاري الرفع" : "Uploading",
      processing: isArabic ? "جاري المعالجة" : "Processing",
      verified: isArabic ? "تم التحقق" : "Verified",
      failed: isArabic ? "فشل" : "Failed",
      pending: isArabic ? "قيد الانتظار" : "Pending",
    };

    return (
      <Badge variant={variants[status]}>
        {labels[status]}
      </Badge>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-brand-500 bg-brand-500/5"
            : "border-ink-200 hover:border-brand-500/40 dark:border-ink-700"
        )}
      >
        <Upload className="mx-auto size-12 text-ink-300" />
        <h3 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">
          {isArabic ? "ارفع مستنداتك" : "Upload Your Documents"}
        </h3>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {isArabic
            ? "اسحب وأفلت أو انقر لاختيار الملفات"
            : "Drag & drop or click to select files"}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {isArabic
            ? "يدعم JPG، PNG، WebP، PDF"
            : "Supports JPG, PNG, WebP, PDF"}
        </p>

        <input
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {/* Uploaded documents */}
      <AnimatePresence>
        {documents.map((doc) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-xl border border-ink-200/80 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
          >
            <div className="flex gap-4">
              {/* Preview */}
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg">
                <img
                  src={doc.preview}
                  alt={doc.file.name}
                  className="h-full w-full object-cover"
                />
                {doc.status === "processing" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="size-6 animate-spin text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                      {doc.file.name}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {(doc.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(doc.status)}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(doc.id)}
                    >
                      <Trash2 className="size-4 text-ink-400" />
                    </Button>
                  </div>
                </div>

                {/* Progress */}
                {doc.status === "processing" && (
                  <div className="mt-3">
                    <Progress value={doc.progress} className="h-2" />
                    <p className="mt-1 text-xs text-ink-500">
                      {isArabic ? "جاري قراءة المستند..." : "Reading document..."}
                    </p>
                  </div>
                )}

                {/* Extraction results */}
                {doc.extraction && doc.status === "verified" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(doc.status)}
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {isArabic ? "تم التحقق بنجاح" : "Verified Successfully"}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {DOCUMENT_TYPE_LABELS[doc.extraction.type][isArabic ? "ar" : "en"]}
                      </Badge>
                    </div>

                    {/* Extracted fields */}
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(doc.extraction.fields).map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
                          <p className="text-[10px] font-bold text-ink-500 dark:text-ink-400 capitalize">
                            {key.replace(/_/g, " ")}
                          </p>
                          <p className="text-sm text-ink-900 dark:text-ink-50">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <AlertTriangle className="size-3" />
                      {isArabic
                        ? `الثقة: ${doc.extraction.confidence}%`
                        : `Confidence: ${doc.extraction.confidence}%`}
                    </div>
                  </div>
                )}

                {/* Error state */}
                {doc.status === "failed" && (
                  <div className="mt-3 flex items-center gap-2">
                    <AlertTriangle className="size-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">
                      {doc.error || (isArabic ? "فشل التحقق" : "Verification failed")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRetry(doc.id)}
                      className="ml-auto"
                    >
                      <RotateCcw className="size-3 mr-1" />
                      {isArabic ? "إعادة المحاولة" : "Retry"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Info box */}
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 size-5 text-brand-500" />
          <div>
            <h4 className="text-sm font-bold text-ink-900 dark:text-ink-50">
              {isArabic ? "التحقق من المستندات" : "Document Verification"}
            </h4>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {isArabic
                ? "يتم معالجة مستنداتك محلياً في متصفحك. لا يتم إرسال أي بيانات إلى خوادمنا."
                : "Your documents are processed locally in your browser. No data is sent to our servers."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
