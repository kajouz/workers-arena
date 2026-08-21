"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  Star,
  Phone,
  Mail,
  Globe,
  Calendar,
  Award,
  Briefcase,
  DollarSign,
  Eye,
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/ui/rating";
import { formatPrice, formatDate } from "@/lib/utils";

interface WorkerDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  categoryNameEn: string;
  categoryNameAr: string;
  citySlug: string;
  areaSlug: string;
  taglineEn: string;
  taglineAr: string;
  bioEn: string;
  bioAr: string;
  rating: number;
  reviewCount: number;
  yearsExp: number;
  verified: boolean;
  verification: string;
  premium: boolean;
  featured: boolean;
  emergency: boolean;
  subscription: {
    plan: string;
    status: string;
    price: number;
    expiresAt: string;
  };
  priceMin: number;
  priceMax: number;
  currency: string;
  phone: string;
  whatsapp: string;
  email: string;
  website?: string;
  services: { nameEn: string; nameAr: string; price: number }[];
  certifications: { nameEn: string; nameAr: string; issuerEn: string; year: number }[];
  views: number;
  leads: number;
  completion: number;
  hue: number;
}

interface WorkerDetailModalProps {
  worker: WorkerDetail | null;
  isOpen: boolean;
  onClose: () => void;
  locale?: string;
}

export function WorkerDetailModal({ worker, isOpen, onClose, locale = "en" }: WorkerDetailModalProps) {
  if (!worker) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 z-50 mx-auto my-auto max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-ink-900"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-ink-100 bg-white/90 p-4 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/90">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="size-12 rounded-full"
                    style={{ backgroundColor: `hsl(${worker.hue}, 70%, 50%)` }}
                  />
                  <div>
                    <h2 className="text-lg font-black text-ink-900 dark:text-ink-50">
                      {locale === "ar" ? worker.nameAr : worker.nameEn}
                    </h2>
                    <p className="text-sm text-ink-500">
                      {locale === "ar" ? worker.categoryNameAr : worker.categoryNameEn}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6 p-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl bg-ink-50 p-3 text-center dark:bg-ink-800/50">
                  <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{worker.rating}</p>
                  <p className="text-[10px] text-ink-400">Rating</p>
                </div>
                <div className="rounded-xl bg-ink-50 p-3 text-center dark:bg-ink-800/50">
                  <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{worker.reviewCount}</p>
                  <p className="text-[10px] text-ink-400">Reviews</p>
                </div>
                <div className="rounded-xl bg-ink-50 p-3 text-center dark:bg-ink-800/50">
                  <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{worker.views.toLocaleString()}</p>
                  <p className="text-[10px] text-ink-400">Views</p>
                </div>
                <div className="rounded-xl bg-ink-50 p-3 text-center dark:bg-ink-800/50">
                  <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{worker.leads}</p>
                  <p className="text-[10px] text-ink-400">Leads</p>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {worker.verified && <Badge variant="success">Verified</Badge>}
                {worker.premium && <Badge variant="premium">Premium</Badge>}
                {worker.featured && <Badge variant="default">Featured</Badge>}
                {worker.emergency && <Badge variant="danger">Emergency</Badge>}
                <Badge variant="outline">{worker.subscription.plan}</Badge>
              </div>

              {/* Contact Info */}
              <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
                <h3 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Contact Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                    <Phone className="size-4" /> {worker.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                    <Mail className="size-4" /> {worker.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                    <MapPin className="size-4" /> {worker.citySlug}, {worker.areaSlug}
                  </div>
                  {worker.website && (
                    <div className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                      <Globe className="size-4" /> {worker.website}
                    </div>
                  )}
                </div>
              </div>

              {/* Services */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Services</h3>
                <div className="space-y-2">
                  {worker.services.map((service, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white p-3 dark:bg-ink-900">
                      <span className="text-sm text-ink-700 dark:text-ink-200">
                        {locale === "ar" ? service.nameAr : service.nameEn}
                      </span>
                      <span className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        {formatPrice(service.price, worker.currency as "SAR" | "AED" | "EGP" | "JOD", locale as "en" | "ar")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              {worker.certifications.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Certifications</h3>
                  <div className="space-y-2">
                    {worker.certifications.map((cert, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-white p-3 dark:bg-ink-900">
                        <Award className="size-4 text-amber-500" />
                        <div>
                          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">
                            {locale === "ar" ? cert.nameAr : cert.nameEn}
                          </p>
                          <p className="text-xs text-ink-400">{cert.issuerEn} · {cert.year}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subscription Info */}
              <div className="rounded-xl bg-brand-500/10 p-4">
                <h3 className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-400">Subscription</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-ink-500">Plan</p>
                    <p className="font-bold text-ink-900 dark:text-ink-50 capitalize">{worker.subscription.plan}</p>
                  </div>
                  <div>
                    <p className="text-ink-500">Status</p>
                    <Badge variant={worker.subscription.status === "active" ? "success" : "danger"}>
                      {worker.subscription.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-ink-500">Price</p>
                    <p className="font-bold text-ink-900 dark:text-ink-50">
                      ${worker.subscription.price}/mo
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-500">Expires</p>
                    <p className="font-bold text-ink-900 dark:text-ink-50">
                      {formatDate(worker.subscription.expiresAt, locale as "en" | "ar")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
                <h3 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Performance</h3>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-500">Completion Rate</span>
                      <span className="font-bold text-ink-900 dark:text-ink-50">{worker.completion}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${worker.completion}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Actions */}
              <div className="flex gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                <Button variant="outline" size="sm" className="flex-1">
                  <MessageSquare className="size-4 mr-2" /> Message
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="size-4 mr-2" /> View Profile
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-amber-600">
                  <Briefcase className="size-4 mr-2" /> Impersonate
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
