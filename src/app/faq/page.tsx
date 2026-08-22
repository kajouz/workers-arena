import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

function getFAQItems(locale: string) {
  const isAr = locale === "ar";
  return [
    {
      category: isAr ? "البدء" : "Getting Started",
      items: [
        {
          q: isAr ? "ما هي وركرز أرينا؟" : "What is WorkersArena?",
          a: isAr
            ? "وركرز أرينا هو سوق يربط العملاء بالمحترفين الموثّقين — سباكون، كهربائيون، نجارون، عمال تنظيف وأكثر من 20 مهنة. ابحث وقارن وراجع واستأجر محترفين موثوقين في دقائق."
            : "WorkersArena is a marketplace connecting customers with verified professional workers — plumbers, electricians, carpenters, cleaners, and 20+ trades. Search, compare, review, and hire trusted professionals in minutes.",
        },
        {
          q: isAr ? "هل استخدام وركرز أرينا مجاني؟" : "Is WorkersArena free to use?",
          a: isAr
            ? "نعم، البحث عن العمال والتواصل معهم مجاني تماماً. يدفع العمال للحصول على ميزات مميزة مثل الإدراج المعزز والخطط الاشتراكية."
            : "Yes, searching for workers and contacting them is completely free. Workers pay for premium features like promoted listings and subscription plans.",
        },
        {
          q: isAr ? "كيف أبحث عن عامل؟" : "How do I search for a worker?",
          a: isAr
            ? "استخدم شريط البحث في الصفحة الرئيسية أو انتقل إلى صفحة التصنيفات. يمكنك التصفية حسب المهنة والمدينة والتقييم ونطاق السعر للعثور على المثالي."
            : "Use the search bar on the homepage or navigate to the Categories page. You can filter by trade, city, rating, and price range to find the perfect match.",
        },
      ],
    },
    {
      category: isAr ? "الحجز والمدفوعات" : "Booking & Payments",
      items: [
        {
          q: isAr ? "كيف أحجز عامل؟" : "How do I book a worker?",
          a: isAr
            ? "تصفح ملفات العمال وتحقق من توفرهم وأرسل طلب حجز مباشرة عبر المنصة. سيؤكد العامل أو يقترح وقتاً بديلاً."
            : "Browse worker profiles, check their availability calendar, and send a booking request directly through the platform. The worker will confirm or suggest an alternative time.",
        },
        {
          q: isAr ? "ما هي طرق الدفع المقبولة؟" : "What payment methods are accepted?",
          a: isAr
            ? "نقبل بطاقات الائتمان/الخصم (عبر سترايب)، و储ishes، وتحويلات OMT. خيارات الدفع اليدوية متاحة أيضاً لخدمات معينة."
            : "We accept credit/debit cards (via Stripe), Whish, and OMT transfers. Manual payment options are also available for certain services.",
        },
        {
          q: isAr ? "هل هناك سياسة إلغاء؟" : "Is there a cancellation policy?",
          a: isAr
            ? "نعم. يمكن للعملاء الإلغاء قبل 24 ساعة من الموعد للحصول على استرداد كامل. قد تُفرض رسوم على الإلغاءات المتأخرة."
            : "Yes. Customers can cancel up to 24 hours before the appointment for a full refund. Late cancellations may incur a fee.",
        },
        {
          q: isAr ? "كيف تعمل العربونات؟" : "How do deposits work?",
          a: isAr
            ? "لحجوزات معينة، يتم تحصيل عربون عند الحجز عبر سترايب. يُطبّق العربون على الفاتورة النهائية."
            : "For certain bookings, a deposit is collected at the time of booking via Stripe. The deposit is applied to the final invoice.",
        },
      ],
    },
    {
      category: isAr ? "ملفات العمال" : "Worker Profiles",
      items: [
        {
          q: isAr ? "كيف يتم توثيق العمال؟" : "How are workers verified?",
          a: isAr
            ? "يخضع العمال للتحقق من الهوية (البريد الإلكتروني والهاتف وأيضاً واتساب). يشمل التوثيق التحقق من الرخص والفصل من الخلفية. يظهر العمال الموثقون شارة في ملفاتهم."
            : "Workers undergo identity verification (email, phone, and optionally WhatsApp). Professional Verification includes license checks and background screening. Verified workers display a badge on their profile.",
        },
        {
          q: isAr ? "هل يمكنني رؤية تقييمات العامل؟" : "Can I see a worker's reviews?",
          a: isAr
            ? "نعم، كل ملف عامل يعرض تقييمات العملاء مع نجوم. يمكنك تصفية التقييمات حسب المهنة والتاريخ والتقييم."
            : "Yes, every worker profile displays customer reviews with star ratings. You can filter reviews by trade, date, and rating.",
        },
        {
          q: isAr ? "كيف أتواصل مع عامل؟" : "How do I contact a worker?",
          a: isAr
            ? "يمكنك التواصل مع العمال عبر الهاتف أو واتساب أو الرسائل داخل التطبيق أو بإرسال طلب حجز عبر صفحة ملفهم."
            : "You can contact workers via phone, WhatsApp, in-app messaging, or by sending a booking request through their profile page.",
        },
      ],
    },
    {
      category: isAr ? "للعمال" : "For Workers",
      items: [
        {
          q: isAr ? "كيف أنضم إلى وركرز أرينا؟" : "How do I join WorkersArena?",
          a: isAr
            ? "اضغط على 'سجّل خدمتك' وأكمل نموذج التسجيل. تحقق من هويتك وابدأ في استقبال طلبات الحجز من العملاء في منطقتك."
            : "Click 'List your services' and complete the registration form. Verify your identity and start receiving booking requests from customers in your area.",
        },
        {
          q: isAr ? "ما هي الخطط الاشتراكية المتاحة؟" : "What subscription plans are available?",
          a: isAr
            ? "نقدم خطط أساسية (مجانية) واحترافية ومؤسسات. كل خطة تشمل ميزات مختلفة مثل الإدراج الأولوية ولوحة التحليلات وأدوات الحملات."
            : "We offer Basic (free), Professional, and Enterprise plans. Each plan includes different features like priority listing, analytics dashboard, and campaign tools.",
        },
        {
          q: isAr ? "كيف أحصل على أرباحي؟" : "How do I get paid?",
          a: isAr
            ? "تتم معالجة المدفوعات للمهام المكتملة عبر المنصة. يمكن للعمال عرض لوحة أرباحهم وطلب سحب أرباحهم إلى حسابهم البنكي."
            : "Payments for completed jobs are processed through the platform. Workers can view their earnings dashboard and request payouts to their bank account.",
        },
      ],
    },
    {
      category: isAr ? "النزاعات والدعم" : "Disputes & Support",
      items: [
        {
          q: isAr ? "ماذا لو كانت هناك مشكلة في الحجز؟" : "What if there's a problem with a booking?",
          a: isAr
            ? "يمكنك تقديم شكوى عبر نظام حل النزاعات. يراجع فريقنا الحالة ويتوسط بين العميل والعامل للوصول إلى حل عادل."
            : "You can file a dispute through the Dispute Resolution system. Our team reviews the case and mediates between the customer and worker to reach a fair resolution.",
        },
        {
          q: isAr ? "كيف أتواصل مع الدعم؟" : "How do I contact support?",
          a: isAr
            ? "استخدم نموذج تذكرة الدعم في مركز المساعدة أو أرسل بريد إلكتروني إلى support@workersarena.com. نرد عادةً خلال 24 ساعة."
            : "Use the Support Ticket form in the Help Center, or email support@workersarena.com. We typically respond within 24 hours.",
        },
        {
          q: isAr ? "هل يمكنني الإبلاغ عن عامل؟" : "Can I report a worker?",
          a: isAr
            ? "نعم، يمكنك الإبلاغ عن عامل من صفحة ملفهم. تُراجع التقارير من فريق المراقبة وقد تؤدي إلى تعليق الحساب."
            : "Yes, you can report a worker from their profile page. Reports are reviewed by our moderation team and may result in account suspension.",
        },
      ],
    },
  ];
}



export default async function FAQPage() {
  const { locale } = await getI18n();
  const isAr = locale === "ar";
  const FAQ_ITEMS = getFAQItems(locale);

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.flatMap((cat) =>
      cat.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      }))
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/30">
            <HelpCircle className="size-7 text-brand-500" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            {isAr ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
          </h1>
          <p className="mt-3 text-lg text-ink-500 dark:text-ink-400">
            {isAr ? "كل ما تحتاج معرفته عن وركرز أرينا" : "Everything you need to know about WorkersArena"}
          </p>
        </div>

        <div className="space-y-10">
          {FAQ_ITEMS.map((section) => (
            <section key={section.category}>
              <h2 className="mb-4 text-xl font-bold text-ink-900 dark:text-ink-50">
                {section.category}
              </h2>
              <div className="space-y-3">
                {section.items.map((item, i) => (
                  <details
                    key={i}
                    className="group rounded-2xl border border-ink-100 bg-white p-5 transition-all dark:border-ink-800 dark:bg-ink-900"
                  >
                    <summary className="cursor-pointer text-base font-semibold text-ink-900 dark:text-ink-50">
                      {item.q}
                    </summary>
                    <p className="mt-3 text-ink-600 dark:text-ink-300 leading-relaxed">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-3xl bg-ink-50 p-8 text-center dark:bg-ink-800">
          <h2 className="text-xl font-bold text-ink-900 dark:text-ink-50">
            {isAr ? "لا تزال لديك أسئلة؟" : "Still have questions?"}
          </h2>
          <p className="mt-2 text-ink-500 dark:text-ink-400">
            {isAr ? "فريق الدعم هنا لمساعدتك." : "Our support team is here to help."}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/support"
              className="inline-flex items-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              {isAr ? "اتصل بالدعم" : "Contact Support"}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-xl border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-700"
            >
              {isAr ? "العودة للرئيسية" : "Back to Home"}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
