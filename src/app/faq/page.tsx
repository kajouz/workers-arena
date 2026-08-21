import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about WorkersArena — how to hire workers, booking, payments, verification, and more.",
};

const FAQ_ITEMS = [
  {
    category: "Getting Started",
    items: [
      {
        q: "What is WorkersArena?",
        a: "WorkersArena is a marketplace connecting customers with verified professional workers — plumbers, electricians, carpenters, cleaners, and 20+ trades. Search, compare, review, and hire trusted professionals in minutes.",
      },
      {
        q: "Is WorkersArena free to use?",
        a: "Yes, searching for workers and contacting them is completely free. Workers pay for premium features like promoted listings and subscription plans.",
      },
      {
        q: "How do I search for a worker?",
        a: "Use the search bar on the homepage or navigate to the Categories page. You can filter by trade, city, rating, and price range to find the perfect match.",
      },
    ],
  },
  {
    category: "Booking & Payments",
    items: [
      {
        q: "How do I book a worker?",
        a: "Browse worker profiles, check their availability calendar, and send a booking request directly through the platform. The worker will confirm or suggest an alternative time.",
      },
      {
        q: "What payment methods are accepted?",
        a: "We accept credit/debit cards (via Stripe), Whish, and OMT transfers. Manual payment options are also available for certain services.",
      },
      {
        q: "Is there a cancellation policy?",
        a: "Yes. Customers can cancel up to 24 hours before the appointment for a full refund. Late cancellations may incur a fee. Workers have their own cancellation policies visible on their profiles.",
      },
      {
        q: "How do deposits work?",
        a: "For certain bookings, a deposit is collected at the time of booking via Stripe. The deposit is applied to the final invoice. Workers receive the deposit upon booking confirmation.",
      },
    ],
  },
  {
    category: "Worker Profiles",
    items: [
      {
        q: "How are workers verified?",
        a: "Workers undergo identity verification (email, phone, and optionally WhatsApp). Professional Verification includes license checks and background screening. Verified workers display a badge on their profile.",
      },
      {
        q: "Can I see a worker's reviews?",
        a: "Yes, every worker profile displays customer reviews with star ratings. You can filter reviews by trade, date, and rating.",
      },
      {
        q: "How do I contact a worker?",
        a: "You can contact workers via phone, WhatsApp, in-app messaging, or by sending a booking request through their profile page.",
      },
    ],
  },
  {
    category: "For Workers",
    items: [
      {
        q: "How do I join WorkersArena?",
        a: "Click 'List your services' and complete the registration form. Verify your identity and start receiving booking requests from customers in your area.",
      },
      {
        q: "What subscription plans are available?",
        a: "We offer Basic (free), Professional, and Enterprise plans. Each plan includes different features like priority listing, analytics dashboard, and campaign tools.",
      },
      {
        q: "How do I get paid?",
        a: "Payments for completed jobs are processed through the platform. Workers can view their earnings dashboard and request payouts to their bank account.",
      },
    ],
  },
  {
    category: "Disputes & Support",
    items: [
      {
        q: "What if there's a problem with a booking?",
        a: "You can file a dispute through the Dispute Resolution system. Our team reviews the case and mediates between the customer and worker to reach a fair resolution.",
      },
      {
        q: "How do I contact support?",
        a: "Use the Support Ticket form in the Help Center, or email support@workersarena.com. We typically respond within 24 hours.",
      },
      {
        q: "Can I report a worker?",
        a: "Yes, you can report a worker from their profile page. Reports are reviewed by our moderation team and may result in account suspension.",
      },
    ],
  },
];

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

export default function FAQPage() {
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
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-lg text-ink-500 dark:text-ink-400">
            Everything you need to know about WorkersArena
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
            Still have questions?
          </h2>
          <p className="mt-2 text-ink-500 dark:text-ink-400">
            Our support team is here to help.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/support"
              className="inline-flex items-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
            >
              Contact Support
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-xl border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-700"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
