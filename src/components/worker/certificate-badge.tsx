"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Award, FileCheck, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface Certification {
  id: string;
  nameEn: string;
  nameAr: string;
  issuerEn?: string;
  issuerAr?: string;
  year?: number;
  fileUrl?: string;
  verified: boolean;
}

interface CertificateBadgeProps {
  certification: Certification;
  compact?: boolean;
  className?: string;
}

/**
 * Certificate verification badge
 */
export function CertificateBadge({
  certification,
  compact = false,
  className,
}: CertificateBadgeProps) {
  const { locale } = useLocale();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowDetails(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-bold transition-colors",
          certification.verified
            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400",
          compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
          className
        )}
      >
        {certification.verified ? (
          <Shield className={cn(compact ? "size-3" : "size-3.5")} />
        ) : (
          <Award className={cn(compact ? "size-3" : "size-3.5")} />
        )}
        {locale === "ar" ? certification.nameAr : certification.nameEn}
        {certification.verified && !compact && " ✓"}
      </button>

      {/* Details dialog */}
      <AnimatePresence>
        {showDetails && (
          <Dialog open={showDetails} onOpenChange={setShowDetails}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {certification.verified ? (
                    <Shield className="size-5 text-emerald-500" />
                  ) : (
                    <Award className="size-5 text-amber-500" />
                  )}
                  {locale === "ar" ? "تفاصيل الشهادة" : "Certificate Details"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-ink-500 dark:text-ink-400">
                    {locale === "ar" ? "الشهادة" : "Certificate"}
                  </label>
                  <p className="text-lg font-bold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? certification.nameAr : certification.nameEn}
                  </p>
                </div>

                {certification.issuerEn && (
                  <div>
                    <label className="text-xs font-bold text-ink-500 dark:text-ink-400">
                      {locale === "ar" ? "الجهة المصدرة" : "Issued By"}
                    </label>
                    <p className="text-ink-700 dark:text-ink-200">
                      {locale === "ar" ? certification.issuerAr : certification.issuerEn}
                    </p>
                  </div>
                )}

                {certification.year && (
                  <div>
                    <label className="text-xs font-bold text-ink-500 dark:text-ink-400">
                      {locale === "ar" ? "السنة" : "Year"}
                    </label>
                    <p className="text-ink-700 dark:text-ink-200">{certification.year}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-ink-500 dark:text-ink-400">
                    {locale === "ar" ? "الحالة" : "Status"}
                  </label>
                  <Badge
                    variant={certification.verified ? "success" : "outline"}
                  >
                    {certification.verified
                      ? locale === "ar" ? "موثقة ✓" : "Verified ✓"
                      : locale === "ar" ? "قيد المراجعة" : "Pending Review"}
                  </Badge>
                </div>

                {certification.fileUrl && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => window.open(certification.fileUrl, "_blank")}
                  >
                    <FileCheck className="size-4" />
                    {locale === "ar" ? "عرض المستند" : "View Document"}
                    <ExternalLink className="size-3" />
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Certificate verification wall of trust
 */
export function CertificateWall({
  certifications,
}: {
  certifications: Certification[];
}) {
  const { locale } = useLocale();
  const verifiedCount = certifications.filter((c) => c.verified).length;

  if (certifications.length === 0) return null;

  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900 dark:text-ink-50">
          {locale === "ar" ? "الشهادات" : "Certifications"}
        </h3>
        <Badge variant="outline">
          {verifiedCount}/{certifications.length} {locale === "ar" ? "موثقة" : "verified"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {certifications.map((cert) => (
          <CertificateBadge key={cert.id} certification={cert} />
        ))}
      </div>
    </div>
  );
}
