import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | WorkersArena",
  description: "WorkersArena privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: September 16, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p>
              WorkersArena (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the WorkersArena platform
              (the &quot;Service&quot;), a local-services marketplace connecting customers with
              professionals in Lebanon and the MENA region.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you use our Service, including our website,
              mobile applications, and related services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Information We Collect</h2>
            <h3 className="text-lg font-medium mt-4">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account information:</strong> name, email, phone number, role (customer/worker/company)</li>
              <li><strong>Worker profiles:</strong> trade category, city, area, bio, portfolio photos, certifications</li>
              <li><strong>Booking data:</strong> job requests, quotes, bookings, payments, reviews</li>
              <li><strong>Payment information:</strong> payment method selections (OMT, Whish, card) — we do not store card numbers</li>
              <li><strong>Communications:</strong> chat messages, support requests, feedback</li>
            </ul>

            <h3 className="text-lg font-medium mt-4">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Device information:</strong> device type, OS version, app version, unique device identifiers</li>
              <li><strong>Usage data:</strong> pages viewed, features used, search queries, booking patterns</li>
              <li><strong>Location data:</strong> city/area (for matching workers with nearby jobs), precise location only with your permission</li>
              <li><strong>Push notification tokens:</strong> for delivering booking reminders and updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, maintain, and improve the Service</li>
              <li>To process bookings, payments, and referrals</li>
              <li>To match customers with suitable workers based on trade, location, and availability</li>
              <li>To send booking confirmations, reminders, and status updates</li>
              <li>To verify worker profiles and maintain platform trust</li>
              <li>To detect and prevent fraud, abuse, and security incidents</li>
              <li>To analyze platform usage and improve our algorithms</li>
              <li>To communicate with you about updates, promotions, and new features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Information Sharing</h2>
            <p>We share your information only in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>With other users:</strong> workers see customer names and phone numbers for bookings; customers see worker profiles and contact info</li>
              <li><strong>With payment processors:</strong> OMT, Whish, and Stripe process payments on our behalf</li>
              <li><strong>With service providers:</strong> hosting, analytics, and notification services that help us operate the platform</li>
              <li><strong>For legal compliance:</strong> when required by law, regulation, or valid legal process</li>
              <li><strong>With your consent:</strong> when you explicitly authorize sharing</li>
            </ul>
            <p className="mt-4">
              We use masked phone numbers for initial customer-worker communication to
              protect privacy until a booking is confirmed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal
              information, including encryption in transit (TLS), secure password hashing,
              role-based access controls, and regular security audits. However, no method
              of electronic transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as
              needed to provide the Service. Booking records are retained for 2 years
              for dispute resolution and tax compliance. You may request deletion of
              your account and associated data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Your Rights</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> request a copy of your personal data</li>
              <li><strong>Correction:</strong> request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> request deletion of your account and data</li>
              <li><strong>Portability:</strong> request your data in a machine-readable format</li>
              <li><strong>Opt-out:</strong> unsubscribe from marketing communications</li>
              <li><strong>Restrict processing:</strong> request that we limit how we use your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Children&apos;s Privacy</h2>
            <p>
              The Service is not intended for users under 18 years of age. We do not
              knowingly collect personal information from children. If we become aware
              that we have collected data from a child, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you
              of any material changes by posting the new policy on this page and
              updating the &quot;Last updated&quot; date. Your continued use of the Service
              after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Email: privacy@workersarena.com</li>
              <li>Address: Beirut, Lebanon</li>
              <li>Support: <a href="/support" className="text-brand-500 hover:underline">workersarena.com/support</a></li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
