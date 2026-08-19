"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, MessageSquare, Book, HelpCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface FAQItem {
  id: string;
  questionEn: string;
  questionAr: string;
  answerEn: string;
  answerAr: string;
  category: string;
}

interface HelpArticle {
  id: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  category: string;
  slug: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    id: "1",
    questionEn: "How do I book a worker?",
    questionAr: "كيف أحجز عامل؟",
    answerEn: "Go to the worker's profile, click 'Book Now', select a service and time slot, then confirm your details. The worker will receive your request and respond within 48 hours.",
    answerAr: "اذهب إلى ملف العامل، اضغط 'احجز الآن'، اختر الخدمة والوقت، ثم أكد بياناتك. سيتلقى العامل طلبك ويرد خلال 48 ساعة.",
    category: "bookings",
  },
  {
    id: "2",
    questionEn: "How do I pay for services?",
    questionAr: "كيف أدفع مقابل الخدمات؟",
    answerEn: "We support multiple payment methods: Credit/Debit cards (Stripe), OMT, and Whish. For OMT/Whish, you'll receive payment instructions and an admin will confirm receipt.",
    answerAr: "ندعم عدة طرق دفع: البطاقات الائتمانية (Stripe)، OMT، وWhish. لـ OMT/Whish، ستتلقى تعليمات الدفع وسيؤكد الأدمن الاستلام.",
    category: "payments",
  },
  {
    id: "3",
    questionEn: "Can I cancel a booking?",
    questionAr: "هل يمكنني إلغاء الحجز؟",
    answerEn: "Yes, you can cancel up to 24 hours before the scheduled time for a full refund. Cancellations within 24 hours may incur a fee depending on the worker's policy.",
    answerAr: "نعم، يمكنك الإلغاء قبل 24 ساعة من الموعد المحدد للحصول على استرداد كامل. الإلغاءات ضمن 24 ساعة قد تخضع لرسوم حسب سياسة العامل.",
    category: "bookings",
  },
  {
    id: "4",
    questionEn: "How do I become a worker on WorkersArena?",
    questionAr: "كيف أصبح عامل على WorkersArena؟",
    answerEn: "Click 'List Your Service' and complete the registration form. You'll need to verify your identity and qualifications. Once approved, you can start receiving bookings.",
    answerAr: "اضغق 'سجل خدمتك' وأكمل نموذج التسجيل. ستحتاج للتحقق من هويتك ومؤهلاتك. بمجرد الموافقة، يمكنك البدء في تلقي الحجوزات.",
    category: "workers",
  },
  {
    id: "5",
    questionEn: "What if I'm not satisfied with the service?",
    questionAr: "ماذا لو لم أكن راضياً عن الخدمة؟",
    answerEn: "Contact our support team within 48 hours of service completion. We'll mediate with the worker and may offer a refund or re-service depending on the situation.",
    answerAr: "تواصل مع فريق الدعم خلال 48 ساعة من اكتمال الخدمة. سنساعد في التفاوض مع العامل و قد نقدم استرداداً أو إعادة خدمة حسب الحالة.",
    category: "support",
  },
];

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "1",
    titleEn: "Getting Started with WorkersArena",
    titleAr: "البدء مع WorkersArena",
    excerptEn: "Learn how to create an account, search for workers, and book your first service.",
    excerptAr: "تعلم كيفية إنشاء حساب، والبحث عن عمال، وحجز خدمتك الأولى.",
    category: "getting-started",
    slug: "getting-started",
  },
  {
    id: "2",
    titleEn: "Worker Verification Process",
    titleAr: "عملية التحقق من العامل",
    excerptEn: "Understand how workers are verified and what the badges mean.",
    excerptAr: "افهم كيف يتم التحقق من العامل وماذا تعني الشارات.",
    category: "workers",
    slug: "worker-verification",
  },
  {
    id: "3",
    titleEn: "Payment Methods Guide",
    titleAr: "دليل طرق الدفع",
    excerptEn: "Complete guide to all available payment methods including OMT and Whish.",
    excerptAr: "دليل شامل لجميع طرق الدفع المتاحة بما في ذلك OMT وWhish.",
    category: "payments",
    slug: "payment-methods",
  },
];

/**
 * Help center component with FAQ, articles, and support ticket form
 */
export function HelpCenter() {
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState<"faq" | "articles" | "support">("faq");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // Filter FAQ based on search
  const filteredFaq = FAQ_DATA.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.questionEn.toLowerCase().includes(query) ||
      item.questionAr.includes(searchQuery) ||
      item.answerEn.toLowerCase().includes(query) ||
      item.answerAr.includes(searchQuery)
    );
  });

  // Filter articles based on search
  const filteredArticles = HELP_ARTICLES.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.titleEn.toLowerCase().includes(query) ||
      item.titleAr.includes(searchQuery) ||
      item.excerptEn.toLowerCase().includes(query) ||
      item.excerptAr.includes(searchQuery)
    );
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50">
          {locale === "ar" ? "مركز المساعدة" : "Help Center"}
        </h1>
        <p className="mt-2 text-ink-500 dark:text-ink-400">
          {locale === "ar" ? "كيف يمكننا مساعدتك؟" : "How can we help you?"}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={locale === "ar" ? "ابحث عن مساعدة..." : "Search for help..."}
          className="ps-10"
        />
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-ink-200 dark:border-ink-800">
        {[
          { key: "faq", icon: HelpCircle, label: locale === "ar" ? "الأسئلة الشائعة" : "FAQ" },
          { key: "articles", icon: Book, label: locale === "ar" ? "المقالات" : "Articles" },
          { key: "support", icon: MessageSquare, label: locale === "ar" ? "التواصل" : "Support" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors",
              activeTab === tab.key
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400"
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* FAQ Tab */}
      {activeTab === "faq" && (
        <div className="space-y-3">
          {filteredFaq.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900"
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === item.id ? null : item.id)}
                className="flex w-full items-center justify-between p-4 text-start"
              >
                <span className="font-bold text-ink-900 dark:text-ink-50">
                  {locale === "ar" ? item.questionAr : item.questionEn}
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 text-ink-400 transition-transform",
                    expandedFaq === item.id && "rotate-180"
                  )}
                />
              </button>
              <AnimatePresence>
                {expandedFaq === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-ink-100 px-4 py-3 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">
                      {locale === "ar" ? item.answerAr : item.answerEn}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {filteredFaq.length === 0 && (
            <p className="py-8 text-center text-ink-500">
              {locale === "ar" ? "لم يتم العثور على نتائج" : "No results found"}
            </p>
          )}
        </div>
      )}

      {/* Articles Tab */}
      {activeTab === "articles" && (
        <div className="space-y-4">
          {filteredArticles.map((article) => (
            <div
              key={article.id}
              className="rounded-xl border border-ink-200/80 bg-white p-4 transition-all hover:border-brand-500/40 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? article.titleAr : article.titleEn}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                    {locale === "ar" ? article.excerptAr : article.excerptEn}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {article.category}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Support Tab */}
      {activeTab === "support" && (
        <SupportTicketForm />
      )}
    </div>
  );
}

/**
 * Support ticket form
 */
function SupportTicketForm() {
  const { locale } = useLocale();
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
          <Send className="size-8 text-emerald-500" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">
          {locale === "ar" ? "تم إرسال التذكرة" : "Ticket Submitted"}
        </h3>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {locale === "ar"
            ? "سنتواصل معك خلال 24 ساعة"
            : "We'll get back to you within 24 hours"}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="space-y-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "الموضوع" : "Subject"}
        </label>
        <Input required placeholder={locale === "ar" ? "كيف يمكننا مساعدتك؟" : "How can we help?"} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "البريد الإلكتروني" : "Email"}
        </label>
        <Input required type="email" placeholder="you@example.com" dir="ltr" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "الرسالة" : "Message"}
        </label>
        <Textarea
          required
          rows={5}
          placeholder={locale === "ar" ? "اشرح مشكلتك بالتفصيل..." : "Describe your issue in detail..."}
        />
      </div>
      <Button type="submit" className="w-full">
        <Send className="size-4" />
        {locale === "ar" ? "إرسال التذكرة" : "Submit Ticket"}
      </Button>
    </form>
  );
}
