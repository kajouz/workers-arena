/**
 * Content Service
 * Manages blog posts and help articles with SEO metadata.
 */

/* ─── Types ─── */
export type ContentCategory =
  | "getting-started"
  | "booking"
  | "payments"
  | "worker-tips"
  | "safety"
  | "faq"
  | "account"
  | "troubleshooting";

export interface ContentPost {
  id: string;
  slug: string;
  title: string;
  titleAr: string;
  excerpt: string;
  excerptAr: string;
  content: string;
  contentAr: string;
  category: ContentCategory;
  tags: string[];
  author: string;
  authorAvatar?: string;
  publishedAt: string;
  updatedAt?: string;
  readingTime: number; // minutes
  featured?: boolean;
  image?: string;
}

export interface ContentCategoryInfo {
  id: ContentCategory;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
}

/* ─── Categories ─── */
export const CONTENT_CATEGORIES: ContentCategoryInfo[] = [
  {
    id: "getting-started",
    name: "Getting Started",
    nameAr: "البداية",
    description: "Learn how to use WorkersArena",
    descriptionAr: "تعلم كيفية استخدام وركرز أرينا",
    icon: "🚀",
  },
  {
    id: "booking",
    name: "Booking & Scheduling",
    nameAr: "الحجز والجدولة",
    description: "How to book and manage services",
    descriptionAr: "كيفية حجز وإدارة الخدمات",
    icon: "📅",
  },
  {
    id: "payments",
    name: "Payments & Billing",
    nameAr: "المدفوعات والفواتير",
    description: "Payment methods, invoices, and refunds",
    descriptionAr: "طرق الدفع والفواتير والاسترداد",
    icon: "💳",
  },
  {
    id: "worker-tips",
    name: "Worker Tips",
    nameAr: "نصائح العمال",
    description: "Grow your business on WorkersArena",
    descriptionAr: "نمّ عملك على وركرز أرينا",
    icon: "🔧",
  },
  {
    id: "safety",
    name: "Safety & Trust",
    nameAr: "السلامة والثقة",
    description: "Verification, reviews, and safety",
    descriptionAr: "التوثيق والمراجعات والسلامة",
    icon: "🛡️",
  },
  {
    id: "faq",
    name: "FAQ",
    nameAr: "الأسئلة الشائعة",
    description: "Frequently asked questions",
    descriptionAr: "الأسئلة المتكررة",
    icon: "❓",
  },
  {
    id: "account",
    name: "Account & Settings",
    nameAr: "الحساب والإعدادات",
    description: "Manage your account and preferences",
    descriptionAr: "إدارة حسابك وتفضيلاتك",
    icon: "⚙️",
  },
  {
    id: "troubleshooting",
    name: "Troubleshooting",
    nameAr: "استكشاف الأخطاء",
    description: "Fix common issues",
    descriptionAr: "إصلاح المشاكل الشائعة",
    icon: "🔧",
  },
];

/* ─── Helper: Reading Time ─── */
export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

/* ─── Mock Data ─── */
export const MOCK_BLOG_POSTS: ContentPost[] = [
  {
    id: "blog-1",
    slug: "how-to-find-plumber-riyadh",
    title: "How to Find a Reliable Plumber in Riyadh",
    titleAr: "كيف تجد ساكباً موثوقاً في الرياض",
    excerpt: "Finding a trustworthy plumber can be challenging. Here's how WorkersArena makes it easy to find verified professionals in Riyadh.",
    excerptAr: "قد يكون العثور على ساكب موثوق صعباً. إليك كيف تجعل وركرز أرينا العثور على محترفين معتمدين في الرياض سهلاً.",
    content: `
## Why Finding a Good Plumber Matters

A bad plumbing job can cost thousands in water damage. That's why it's crucial to hire a verified professional.

## Steps to Find a Plumber on WorkersArena

1. **Search by trade** — Enter "Plumber" in the search bar
2. **Filter by location** — Select Riyadh and your area
3. **Check reviews** — Look for workers with 4+ star ratings
4. **Verify credentials** — Choose workers with the Verified badge
5. **Compare prices** — Get quotes from multiple workers

## Red Flags to Watch For

- No reviews or very few reviews
- No verification badge
- Prices significantly lower than average
- No portfolio or past work examples

## Why WorkersArena is Different

Every worker on our platform is background-checked and verified. We only accept professionals with proven track records.
    `,
    category: "getting-started",
    tags: ["plumber", "riyadh", "search", "hiring"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-15",
    readingTime: 4,
    featured: true,
  },
  {
    id: "blog-2",
    slug: "worker-profile-tips",
    title: "10 Tips to Make Your Worker Profile Stand Out",
    titleAr: "10 نصائح لتمييز ملفك كعامل",
    excerpt: "Your profile is your first impression. Learn how to optimize it to attract more customers.",
    excerptAr: "ملفك هو انطباعك الأول. تعلم كيفية تحسينه لجذب المزيد من العملاء.",
    content: `
## Why Your Profile Matters

Customers see hundreds of profiles. A great profile helps you stand out and win more jobs.

## 10 Profile Optimization Tips

1. **Professional photo** — Use a clear, friendly headshot
2. **Compelling bio** — Tell your story in 2-3 sentences
3. **List all services** — Be specific about what you offer
4. **Set competitive prices** — Research what others charge
5. **Show your portfolio** — Upload before/after photos
6. **Get verified** — Complete the verification process
7. **Collect reviews** — Ask satisfied customers to review you
8. **Update availability** — Keep your calendar current
9. **Respond quickly** — Fast response rate boosts visibility
10. **Add certifications** — Upload licenses and certificates
    `,
    category: "worker-tips",
    tags: ["profile", "optimization", "workers", "marketing"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-10",
    readingTime: 5,
  },
  {
    id: "blog-3",
    slug: "safe-hiring-guide",
    title: "The Complete Guide to Hiring Workers Safely",
    titleAr: "الدليل الكامل لتوظيف العمال بأمان",
    excerpt: "Safety should be your top priority when hiring someone to work in your home. Follow these best practices.",
    excerptAr: "يجب أن تكون السلامة أولويتك عند توظيف شخص للعمل في منزلك. اتبع أفضل الممارسات.",
    content: `
## Before Hiring

1. **Verify identity** — Check the worker's verified badge
2. **Read reviews** — Look for consistent positive feedback
3. **Get quotes in writing** — Always have a written estimate
4. **Check insurance** — Ensure they have liability coverage

## During the Job

5. **Be present** — Stay home during the work
6. **Document everything** — Take photos before and after
7. **Don't pay upfront** — Pay after work is completed
8. **Keep receipts** — Save all payment records

## After the Job

9. **Inspect the work** — Check everything before final payment
10. **Leave a review** — Help other customers make informed decisions
    `,
    category: "safety",
    tags: ["safety", "hiring", "verification", "trust"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-05",
    readingTime: 6,
  },
];

export const MOCK_HELP_ARTICLES: ContentPost[] = [
  {
    id: "help-1",
    slug: "how-to-book",
    title: "How to Book a Worker",
    titleAr: "كيفية حجز عامل",
    excerpt: "Step-by-step guide to booking a worker on WorkersArena.",
    excerptAr: "دليل خطوة بخطوة لحجز عامل على وركرز أرينا.",
    content: `
## Booking Steps

1. Search for the trade you need
2. Click on a worker profile
3. Click "Book Now" or "Get Quotes"
4. Select a date and time
5. Describe the job
6. Confirm the booking

## What Happens Next

- The worker receives your request
- They can accept, decline, or send a quote
- You'll be notified of their response
- Once confirmed, you'll get booking details
    `,
    category: "booking",
    tags: ["booking", "how-to", "guide"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-18",
    readingTime: 3,
  },
  {
    id: "help-2",
    slug: "payment-methods",
    title: "Payment Methods Accepted",
    titleAr: "طرق الدفع المقبولة",
    excerpt: "Learn about all the payment options available on WorkersArena.",
    excerptAr: "تعرف على جميع خيارات الدفع المتاحة على وركرز أرينا.",
    content: `
## Available Payment Methods

### Online Payments
- **Stripe** — Credit/debit cards (Visa, Mastercard, AMEX)
- **Apple Pay** — For iOS users
- **Google Pay** — For Android users

### Manual Payments (Lebanon)
- **OMT** — Transfer to any OMT agent
- **Whish** — Transfer via Whish Money

### How to Pay

1. Go to your booking
2. Click "Pay Deposit"
3. Select your payment method
4. Complete the payment
5. You'll receive a confirmation
    `,
    category: "payments",
    tags: ["payments", "stripe", "omt", "whish"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-12",
    readingTime: 3,
  },
  {
    id: "help-3",
    slug: "account-settings",
    title: "Managing Your Account Settings",
    titleAr: "إدارة إعدادات حسابك",
    excerpt: "How to update your profile, notifications, and preferences.",
    excerptAr: "كيفية تحديث ملفك الشخصي والإشعارات والتفضيلات.",
    content: `
## Account Settings

### Profile
- Update your name and photo
- Change your email or phone
- Add a bio and description

### Notifications
- Email notifications
- Push notifications
- SMS notifications

### Privacy
- Profile visibility
- Review visibility
- Data export

### Security
- Change password
- Two-factor authentication
- Active sessions
    `,
    category: "account",
    tags: ["account", "settings", "profile", "privacy"],
    author: "WorkersArena Team",
    publishedAt: "2026-08-08",
    readingTime: 4,
  },
];

/* ─── Service Functions ─── */
export function getAllPosts(): ContentPost[] {
  return [...MOCK_BLOG_POSTS, ...MOCK_HELP_ARTICLES].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getBlogPosts(): ContentPost[] {
  return MOCK_BLOG_POSTS.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getHelpArticles(): ContentPost[] {
  return MOCK_HELP_ARTICLES.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getPostBySlug(slug: string): ContentPost | undefined {
  return getAllPosts().find((p) => p.slug === slug);
}

export function getPostsByCategory(category: ContentCategory): ContentPost[] {
  return getAllPosts().filter((p) => p.category === category);
}

export function searchPosts(query: string): ContentPost[] {
  const lower = query.toLowerCase();
  return getAllPosts().filter(
    (p) =>
      p.title.toLowerCase().includes(lower) ||
      p.titleAr.includes(query) ||
      p.excerpt.toLowerCase().includes(lower) ||
      p.tags.some((t) => t.includes(lower))
  );
}

export function getFeaturedPosts(): ContentPost[] {
  return getAllPosts().filter((p) => p.featured);
}

export function getCategoryInfo(id: ContentCategory): ContentCategoryInfo | undefined {
  return CONTENT_CATEGORIES.find((c) => c.id === id);
}
