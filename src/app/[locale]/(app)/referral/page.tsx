import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { ArrowRight, Users, Gift, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Referral Program | WorkersArena",
  description: "Invite other workers to WorkersArena and earn bonus credits for every qualified referral.",
};

export default function ReferralPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <div className="max-w-5xl mx-auto px-4 py-20 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Invite Workers, Earn Rewards
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8">
            Know a great plumber, electrician, or carpenter? Invite them to WorkersArena
            and you both earn bonus credits when they join.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register">
              <Button size="lg" className="bg-white dark:bg-ink-900 text-brand-600 hover:bg-white/90">
                Join Now <ArrowRight className="ms-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/search">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                Browse Workers
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-brand-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">1. Share Your Code</h3>
            <p className="text-muted-foreground">
              Get your unique referral code from the dashboard. Share it with workers you know.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
              <Gift className="h-8 w-8 text-brand-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">2. They Sign Up</h3>
            <p className="text-muted-foreground">
              When they register using your code, they get a welcome bonus of 10 credits.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
              <Star className="h-8 w-8 text-brand-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">3. You Both Earn</h3>
            <p className="text-muted-foreground">
              When they complete their first booking, you get 25 bonus credits. They get 10.
            </p>
          </div>
        </div>
      </section>

      {/* Rewards breakdown */}
      <section className="bg-muted/50">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Reward Tiers</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { referrals: "1–5", bonus: "25 credits each", icon: "🥉" },
              { referrals: "6–15", bonus: "30 credits each", icon: "🥈" },
              { referrals: "16–50", bonus: "40 credits each", icon: "🥇" },
              { referrals: "50+", bonus: "50 credits each", icon: "🏆" },
            ].map((tier) => (
              <div key={tier.referrals} className="bg-card rounded-xl border p-6 text-center">
                <div className="text-3xl mb-3">{tier.icon}</div>
                <p className="text-sm text-muted-foreground mb-1">{tier.referrals} referrals</p>
                <p className="text-xl font-bold">{tier.bonus}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">Why Refer WorkersArena?</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            "Free Starter trial for new workers",
            "Qualified leads delivered daily",
            "Booking management and scheduling",
            "Secure payments via OMT/Whish",
            "Professional profile and portfolio",
            "Analytics and earnings tracking",
          ].map((benefit) => (
            <div key={benefit} className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-500 text-white">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Earning?</h2>
          <p className="text-lg text-white/80 mb-8">
            Join thousands of workers growing their business on WorkersArena.
          </p>
          <Link href="/auth/register">
            <Button size="lg" className="bg-white dark:bg-ink-900 text-brand-600 hover:bg-white/90">
              Create Your Account <ArrowRight className="ms-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
