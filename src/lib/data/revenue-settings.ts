/**
 * REVENUE SETTINGS — ADMIN-CONFIGURABLE REVENUE STREAMS
 * 
 * This module provides:
 * 1. Type definitions for all revenue streams
 * 2. Configuration management with enable/disable toggles
 * 3. Pricing configuration for each stream
 * 4. Package management for credits/tokens
 * 5. Audit logging for all changes
 */

// ─── Revenue Stream Types ────────────────────────────────────────────────────

export type RevenueStreamId = 
  | 'credits'
  | 'tokens'
  | 'sliding_commissions'
  | 'background_checks'
  | 'instant_payouts'
  | 'saas_tools'
  | 'promoted_profiles'
  | 'premium_support'
  | 'branding'
  | 'insurance'
  | 'training'
  | 'equipment_marketplace'
  | 'whitelabel';

export interface RevenueStreamConfig {
  id: RevenueStreamId;
  name: string;
  nameAr: string;
  enabled: boolean;
  description: string;
  descriptionAr: string;
  settings: Record<string, unknown>;
  pricing: PricingConfig;
  effectiveFrom?: string;
  effectiveUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingConfig {
  type: 'fixed' | 'percentage' | 'tiered' | 'dynamic';
  tiers?: PricingTier[];
  min?: number;
  max?: number;
  currency: string;
}

export interface PricingTier {
  id: string;
  name: string;
  nameAr: string;
  min: number;
  max: number;
  rate: number;
  enabled: boolean;
  sortOrder: number;
}

// ─── Credit System Types ─────────────────────────────────────────────────────

export interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  bonusCredits: number;
  popular: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface CreditBalance {
  workerId: string;
  balance: number;
  totalPurchased: number;
  totalSpent: number;
  totalRefunded: number;
  expiresAt?: string;
  lastActivityAt: string;
}

export interface CreditTransaction {
  id: string;
  workerId: string;
  type: 'purchase' | 'spend' | 'refund' | 'bonus' | 'expire';
  amount: number;
  balanceAfter: number;
  description: string;
  descriptionAr: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Token System Types ──────────────────────────────────────────────────────

export interface TokenPackage {
  id: string;
  tokens: number;
  price: number;
  bonusTokens: number;
  popular: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface TokenBalance {
  workerId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalPurchased: number;
  totalExpired: number;
  expiresAt: string;
  lastActivityAt: string;
}

export interface TokenTransaction {
  id: string;
  workerId: string;
  type: 'earn' | 'spend' | 'purchase' | 'expire' | 'bonus';
  amount: number;
  balanceAfter: number;
  description: string;
  descriptionAr: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Sliding Commissions Types ───────────────────────────────────────────────

export interface CommissionTier {
  id: string;
  name: string;
  nameAr: string;
  minBillings: number;
  maxBillings: number;
  ratePercent: number;
  enabled: boolean;
  sortOrder: number;
}

export interface WorkerCommissionInfo {
  workerId: string;
  lifetimeBillings: number;
  currentTier: CommissionTier;
  nextTier?: CommissionTier;
  savingsToDate: number;
}

// ─── Background Check Types ──────────────────────────────────────────────────

export interface BackgroundCheckType {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  processingDays: number;
  requiredDocuments: string[];
  enabled: boolean;
}

export interface BackgroundCheck {
  id: string;
  workerId: string;
  typeId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  result?: string;
  certificateUrl?: string;
  purchasedAt: string;
  completedAt?: string;
  expiresAt?: string;
  verifiedBy?: string;
  notes?: string;
}

// ─── Instant Payout Types ────────────────────────────────────────────────────

export interface PayoutTier {
  id: string;
  name: string;
  nameAr: string;
  feePercent: number;
  minFee: number;
  processingHours: number;
  enabled: boolean;
  sortOrder: number;
}

export interface WorkerPayout {
  id: string;
  workerId: string;
  tierId: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  processedAt?: string;
  failureReason?: string;
  reference?: string;
}

// ─── SaaS Tools Types ────────────────────────────────────────────────────────

export interface SaasToolCatalog {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  featuresAr: string[];
  category: 'invoicing' | 'crm' | 'analytics' | 'team' | 'marketing';
  enabled: boolean;
  trialEnabled: boolean;
  trialDays: number;
  maxUsers?: number;
  icon?: string;
}

export interface WorkerToolSubscription {
  id: string;
  workerId: string;
  toolId: string;
  status: 'active' | 'trial' | 'cancelled' | 'expired';
  startedAt: string;
  expiresAt: string;
  billingPeriod: 'monthly' | 'annual';
  autoRenew: boolean;
  lastBillingAt?: string;
  nextBillingAt?: string;
}

// ─── Promoted Profiles Types ─────────────────────────────────────────────────

export interface PromotedCampaign {
  id: string;
  workerId: string;
  maxCpc: number; // cents
  dailyBudget: number; // cents
  totalSpent: number;
  impressions: number;
  clicks: number;
  status: 'active' | 'paused' | 'budget_exceeded' | 'ended';
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotedClick {
  id: string;
  campaignId: string;
  workerId: string;
  searchQuery: string;
  categorySlug: string;
  citySlug: string;
  position: number;
  cost: number; // cents
  timestamp: string;
}

export interface PromotedImpression {
  id: string;
  campaignId: string;
  workerId: string;
  searchQuery: string;
  categorySlug: string;
  citySlug: string;
  position: number;
  timestamp: string;
}

// ─── Premium Support Types ───────────────────────────────────────────────────

export interface SupportTier {
  id: string;
  name: string;
  nameAr: string;
  monthlyPrice: number;
  features: string[];
  featuresAr: string[];
  responseTimeHours: number;
  channels: string[];
  enabled: boolean;
}

export interface WorkerSupportSubscription {
  workerId: string;
  tierId: string;
  status: 'active' | 'cancelled';
  startedAt: string;
  expiresAt: string;
}

// ─── Insurance Types ─────────────────────────────────────────────────────────

export interface InsuranceProduct {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  type: 'general_liability' | 'tool_insurance' | 'workers_comp';
  priceType: 'percentage' | 'fixed';
  price: number;
  coverageAmount: number;
  deductible: number;
  enabled: boolean;
}

// ─── Training Types ──────────────────────────────────────────────────────────

export interface TrainingCourse {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  duration: string;
  category: string;
  instructor: string;
  rating: number;
  enrolledCount: number;
  enabled: boolean;
}

export interface SkillBadge {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  icon: string;
  requirements: string[];
  enabled: boolean;
}

// ─── Equipment Marketplace Types ─────────────────────────────────────────────

export interface EquipmentListing {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  type: 'sale' | 'rental';
  price: number;
  priceUnit?: 'hour' | 'day' | 'week' | 'month';
  sellerId: string;
  available: boolean;
  images: string[];
  category: string;
}

// ─── White-Label Types ───────────────────────────────────────────────────────

export interface WhiteLabelPackage {
  id: string;
  name: string;
  nameAr: string;
  monthlyPrice: number;
  features: string[];
  featuresAr: string[];
  enabled: boolean;
}

// ─── Audit Log Types ─────────────────────────────────────────────────────────

export interface RevenueStreamAudit {
  id: string;
  streamId: RevenueStreamId;
  action: 'enabled' | 'disabled' | 'price_changed' | 'tier_added' | 'tier_removed' | 'settings_updated';
  oldValue?: unknown;
  newValue?: unknown;
  adminId: string;
  adminName: string;
  createdAt: string;
}

// ─── Default Configurations ──────────────────────────────────────────────────

export const DEFAULT_CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'starter', credits: 10, price: 25, bonusCredits: 0, popular: false, enabled: true, sortOrder: 1 },
  { id: 'popular', credits: 25, price: 50, bonusCredits: 5, popular: true, enabled: true, sortOrder: 2 },
  { id: 'professional', credits: 50, price: 90, bonusCredits: 15, popular: false, enabled: true, sortOrder: 3 },
  { id: 'enterprise', credits: 100, price: 150, bonusCredits: 30, popular: false, enabled: true, sortOrder: 4 },
];

export const DEFAULT_TOKEN_PACKAGES: TokenPackage[] = [
  { id: 'starter', tokens: 20, price: 15, bonusTokens: 0, popular: false, enabled: true, sortOrder: 1 },
  { id: 'popular', tokens: 50, price: 30, bonusTokens: 10, popular: true, enabled: true, sortOrder: 2 },
  { id: 'professional', tokens: 100, price: 50, bonusTokens: 25, popular: false, enabled: true, sortOrder: 3 },
];

export const DEFAULT_COMMISSION_TIERS: CommissionTier[] = [
  { id: 'starter', name: 'Starter', nameAr: 'مبتدئ', minBillings: 0, maxBillings: 5000, ratePercent: 7, enabled: true, sortOrder: 1 },
  { id: 'bronze', name: 'Bronze', nameAr: 'برونزي', minBillings: 5001, maxBillings: 15000, ratePercent: 6, enabled: true, sortOrder: 2 },
  { id: 'silver', name: 'Silver', nameAr: 'فضي', minBillings: 15001, maxBillings: 50000, ratePercent: 5, enabled: true, sortOrder: 3 },
  { id: 'gold', name: 'Gold', nameAr: 'ذهبي', minBillings: 50001, maxBillings: 100000, ratePercent: 4, enabled: true, sortOrder: 4 },
  { id: 'platinum', name: 'Platinum', nameAr: 'بلاتيني', minBillings: 100001, maxBillings: Infinity, ratePercent: 3, enabled: true, sortOrder: 5 },
];

export const DEFAULT_BACKGROUND_CHECK_TYPES: BackgroundCheckType[] = [
  { id: 'basic', name: 'Basic ID Verification', nameAr: 'التحقق الأساسي من الهوية', description: 'Verify identity with government ID', descriptionAr: 'التحقق من الهوية ببطاقة الحكومة', price: 15, processingDays: 1, requiredDocuments: ['government_id'], enabled: true },
  { id: 'standard', name: 'Standard Background', nameAr: 'التحقق المعياري', description: 'Comprehensive background screening', descriptionAr: 'فحص شامل للسجلات', price: 35, processingDays: 5, requiredDocuments: ['government_id', 'address_proof'], enabled: true },
  { id: 'premium', name: 'Premium Comprehensive', nameAr: 'التحقق الشامل المتميز', description: 'Full background check with references', descriptionAr: 'فحص كامل مع المراجع', price: 75, processingDays: 7, requiredDocuments: ['government_id', 'address_proof', 'references'], enabled: true },
  { id: 'criminal', name: 'Criminal Record Check', nameAr: 'فحص السجل الجنائي', description: 'Criminal history verification', descriptionAr: 'التحقق من السجل الجنائي', price: 50, processingDays: 10, requiredDocuments: ['government_id', 'consent_form'], enabled: true },
];

export const DEFAULT_PAYOUT_TIERS: PayoutTier[] = [
  { id: 'standard', name: 'Standard', nameAr: 'قياسي', feePercent: 0, minFee: 0, processingHours: 72, enabled: true, sortOrder: 1 },
  { id: 'express', name: 'Express', nameAr: 'سريع', feePercent: 2, minFee: 5, processingHours: 24, enabled: true, sortOrder: 2 },
  { id: 'instant', name: 'Instant', nameAr: 'فوري', feePercent: 3, minFee: 10, processingHours: 2, enabled: true, sortOrder: 3 },
];

export const DEFAULT_SAAS_TOOLS: SaasToolCatalog[] = [
  {
    id: 'invoicing-pro',
    name: 'Invoicing Pro',
    nameAr: 'الفوترة المتقدمة',
    description: 'Create professional invoices, track payments, and manage your finances',
    descriptionAr: 'إنشاء فواتير احترافية وتتبع المدفوعات وإدارة أموالك',
    monthlyPrice: 9.99,
    annualPrice: 99,
    features: ['Custom invoice templates', 'PDF export', 'Payment tracking', 'Recurring invoices', 'Tax calculations'],
    featuresAr: ['قوالب فواتير مخصصة', 'تصدير PDF', 'تتبع المدفوعات', 'فوترة دورية', 'حسابات الضرائب'],
    category: 'invoicing',
    enabled: true,
    trialEnabled: true,
    trialDays: 7,
  },
  {
    id: 'crm-basic',
    name: 'CRM Basic',
    nameAr: 'إدارة العلاقات الأساسية',
    description: 'Manage your customer relationships and follow up effectively',
    descriptionAr: 'إدارة علاقات عملائك والمتابعة بفعالية',
    monthlyPrice: 14.99,
    annualPrice: 149,
    features: ['Customer database', 'Follow-up reminders', 'Contact history', 'Notes and tags', 'Basic reporting'],
    featuresAr: ['قاعدة بيانات العملاء', 'تذكيرات المتابعة', 'سجل الاتصال', 'ملاحظات وعلامات', 'تقارير أساسية'],
    category: 'crm',
    enabled: true,
    trialEnabled: true,
    trialDays: 7,
  },
  {
    id: 'crm-pro',
    name: 'CRM Pro',
    nameAr: 'إدارة العلاقات المتقدمة',
    description: 'Advanced CRM with email campaigns and automation',
    descriptionAr: 'إدارة علاقات متقدمة مع حملات بريد إلكتروني وأتمتة',
    monthlyPrice: 24.99,
    annualPrice: 249,
    features: ['Everything in CRM Basic', 'Email campaigns', 'Automation workflows', 'Lead scoring', 'Pipeline management'],
    featuresAr: ['كل مزايا CRM الأساسي', 'حملات بريد إلكتروني', 'سير عمل الأتمتة', 'تصنيف العملاء المحتملين', 'إدارة خط الإنتاج'],
    category: 'crm',
    enabled: true,
    trialEnabled: true,
    trialDays: 7,
  },
  {
    id: 'analytics-dashboard',
    name: 'Analytics Dashboard',
    nameAr: 'لوحة تحليلات',
    description: 'Detailed analytics, charts, and business insights',
    descriptionAr: 'تحليلات تفصيلية ورسوم بيانية ورؤى الأعمال',
    monthlyPrice: 19.99,
    annualPrice: 199,
    features: ['Revenue analytics', 'Customer insights', 'Performance charts', 'Export to Excel', 'Custom date ranges'],
    featuresAr: ['تحليلات الإيرادات', 'رؤى العملاء', 'رسوم بيانية للأداء', 'تصدير إلى Excel', 'نطاقات تاريخ مخصصة'],
    category: 'analytics',
    enabled: true,
    trialEnabled: true,
    trialDays: 7,
  },
  {
    id: 'team-management',
    name: 'Team Management',
    nameAr: 'إدارة الفريق',
    description: 'Manage multiple staff accounts and scheduling',
    descriptionAr: 'إدارة حسابات الموظفين المتعددة والجدولة',
    monthlyPrice: 29.99,
    annualPrice: 299,
    features: ['Multiple staff accounts', 'Role-based access', 'Shared calendar', 'Task assignment', 'Performance tracking'],
    featuresAr: ['حسابات موظفين متعددة', 'وصول מבוסס الأدوار', 'تقويم مشترك', 'تعيين المهام', 'تتبع الأداء'],
    category: 'team',
    enabled: true,
    trialEnabled: true,
    trialDays: 7,
    maxUsers: 10,
  },
];

export const DEFAULT_SUPPORT_TIERS: SupportTier[] = [
  {
    id: 'standard',
    name: 'Standard Support',
    nameAr: 'الدعم الأساسي',
    monthlyPrice: 0,
    features: ['Email support', 'Help center access', 'Community forums'],
    featuresAr: ['دعم عبر البريد الإلكتروني', 'مركز المساعدة', 'منتديات المجتمع'],
    responseTimeHours: 48,
    channels: ['email'],
    enabled: true,
  },
  {
    id: 'priority',
    name: 'Priority Support',
    nameAr: 'الدعم ذو الأولوية',
    monthlyPrice: 19.99,
    features: ['Priority email support', 'Live chat', '1-hour response time', 'Phone support'],
    featuresAr: ['دعم بريد إلكتروني ذو أولوية', 'دردشة مباشرة', 'استجابة خلال ساعة', 'دعم هاتفي'],
    responseTimeHours: 1,
    channels: ['email', 'chat', 'phone'],
    enabled: true,
  },
  {
    id: 'dedicated',
    name: 'Dedicated Account Manager',
    nameAr: 'مدير حساب مخصص',
    monthlyPrice: 49.99,
    features: ['Dedicated account manager', 'Custom onboarding', 'Quarterly reviews', 'Priority feature requests'],
    featuresAr: ['مدير حساب مخصص', 'إعداد مخصص', 'مراجعات ربع سنوية', 'طلبات ميزات ذات أولوية'],
    responseTimeHours: 0.5,
    channels: ['email', 'chat', 'phone', 'video'],
    enabled: true,
  },
];

export const DEFAULT_INSURANCE_PRODUCTS: InsuranceProduct[] = [
  {
    id: 'general-liability',
    name: 'General Liability Insurance',
    nameAr: 'تأمين المسؤولية العامة',
    description: 'Protect against third-party claims for bodily injury or property damage',
    descriptionAr: 'الحماية من مطالبات الأطراف الثالثة لإصابات_body أو أضرار الممتلكات',
    type: 'general_liability',
    priceType: 'percentage',
    price: 3,
    coverageAmount: 1000000,
    deductible: 500,
    enabled: true,
  },
  {
    id: 'tool-insurance',
    name: 'Tool Insurance',
    nameAr: 'تأمين الأدوات',
    description: 'Cover your tools against theft, damage, or loss',
    descriptionAr: 'تغطية أدواتك ضد السرقة أو الضرر أو الفقدان',
    type: 'tool_insurance',
    priceType: 'fixed',
    price: 9.99,
    coverageAmount: 5000,
    deductible: 100,
    enabled: true,
  },
  {
    id: 'workers-comp',
    name: "Workers' Compensation",
    nameAr: 'تعويض العمال',
    description: 'Coverage for work-related injuries or illnesses',
    descriptionAr: 'تغطية الإصابات أو الأمراض المتعلقة بالعمل',
    type: 'workers_comp',
    priceType: 'percentage',
    price: 2,
    coverageAmount: 500000,
    deductible: 250,
    enabled: true,
  },
];

// ─── In-Memory Store (Demo Mode) ─────────────────────────────────────────────

interface RevenueSettingsStore {
  streams: Map<RevenueStreamId, RevenueStreamConfig>;
  creditPackages: CreditPackage[];
  tokenPackages: TokenPackage[];
  commissionTiers: CommissionTier[];
  backgroundCheckTypes: BackgroundCheckType[];
  payoutTiers: PayoutTier[];
  saasTools: SaasToolCatalog[];
  supportTiers: SupportTier[];
  insuranceProducts: InsuranceProduct[];
  auditLog: RevenueStreamAudit[];
}

const GLOBAL_KEY = '__WORKERS_ARENA_REVENUE_SETTINGS__';
const g = globalThis as unknown as Record<string, RevenueSettingsStore>;

function getStore(): RevenueSettingsStore {
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY];
  
  const store: RevenueSettingsStore = {
    streams: new Map(),
    creditPackages: [...DEFAULT_CREDIT_PACKAGES],
    tokenPackages: [...DEFAULT_TOKEN_PACKAGES],
    commissionTiers: [...DEFAULT_COMMISSION_TIERS],
    backgroundCheckTypes: [...DEFAULT_BACKGROUND_CHECK_TYPES],
    payoutTiers: [...DEFAULT_PAYOUT_TIERS],
    saasTools: [...DEFAULT_SAAS_TOOLS],
    supportTiers: [...DEFAULT_SUPPORT_TIERS],
    insuranceProducts: [...DEFAULT_INSURANCE_PRODUCTS],
    auditLog: [],
  };

  // Initialize default stream configs
  const defaultStreams: RevenueStreamConfig[] = [
    {
      id: 'credits',
      name: 'Pay-Per-Lead Credits',
      nameAr: 'رصيد الدفع لكل عميل محتمل',
      enabled: true,
      description: 'Workers buy credits to send quotes/messages to customers',
      descriptionAr: 'يشتري العمال الرصيد لإرسال عروض أسعار/رسائل للعملاء',
      settings: {
        creditPricePerUnit: 2.50,
        standardLeadCost: 1,
        priorityLeadCost: 3,
        emergencyLeadCost: 5,
        autoRefundEnabled: true,
        bulkDiscountEnabled: true,
        freeCreditsOnSignup: 5,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tokens',
      name: 'Application Tokens',
      nameAr: 'رموز التقديم',
      enabled: true,
      description: 'Virtual currency for job applications',
      descriptionAr: 'عملة افتراضية لتقديم طلبات العمل',
      settings: {
        tokenPricePerUnit: 0.75,
        jobApplicationCost: 1,
        premiumApplicationCost: 3,
        featuredApplicationCost: 5,
        tokensPerBooking: 2,
        tokensPer5Star: 1,
        monthlyActiveBonus: 5,
        tokenExpiryDays: 90,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sliding_commissions',
      name: 'Sliding Commissions',
      nameAr: 'العمولات المتدرجة',
      enabled: true,
      description: 'Fee decreases as lifetime billings grow',
      descriptionAr: 'تخفيض الرسوم مع نمو الفواتير الإجمالية',
      settings: {
        baseCommissionRate: 7,
      },
      pricing: { type: 'tiered', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'background_checks',
      name: 'Background Check Fees',
      nameAr: 'رسوم فحص الخلفية',
      enabled: true,
      description: 'One-time onboarding fee for vetting/screening',
      descriptionAr: 'رسوم تأسيس لمرة واحدة للتحقق/الفحص',
      settings: {
        checkValidityMonths: 12,
        autoExpireEnabled: true,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'instant_payouts',
      name: 'Instant Payout Fees',
      nameAr: 'رسوم السحب الفوري',
      enabled: true,
      description: 'Charge for same-day fund transfers',
      descriptionAr: 'رسوم على تحويلات الأموال في نفس اليوم',
      settings: {
        minPayoutAmount: 50,
        maxDailyPayout: 5000,
        expressProcessingHours: 24,
        instantProcessingHours: 2,
      },
      pricing: { type: 'percentage', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'saas_tools',
      name: 'SaaS Subscriptions',
      nameAr: 'اشتراكات SaaS',
      enabled: true,
      description: 'Premium tools (invoicing, CRM, analytics)',
      descriptionAr: 'أدوات متقدمة (فوترة، إدارة علاقات، تحليلات)',
      settings: {
        freeTrialDays: 7,
        bundleDiscountPercent: 15,
        annualDiscountPercent: 17,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'promoted_profiles',
      name: 'Promoted Profiles',
      nameAr: 'الملفات الشخصية المروجة',
      enabled: true,
      description: 'CPC bidding for search visibility',
      descriptionAr: 'مناقصة CPC للظهور في البحث',
      settings: {
        minCpcBid: 0.50,
        maxCpcBid: 10.00,
        minDailyBudget: 5,
        maxDailyBudget: 100,
        qualityScoreEnabled: true,
        autoOptimizationEnabled: true,
        promotedPositions: 3,
      },
      pricing: { type: 'dynamic', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'premium_support',
      name: 'Premium Support',
      nameAr: 'الدعم المتميز',
      enabled: false,
      description: 'Priority support tiers',
      descriptionAr: 'مستويات دعم ذات أولوية',
      settings: {},
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'branding',
      name: 'Worker Branding Package',
      nameAr: 'حزمة العلامة التجارية للعمال',
      enabled: false,
      description: 'Profile customization, business cards, social media kit, and verified badges',
      descriptionAr: 'تخصيص الملف الشخصي، بطاقات العمل، أدوات التواصل الاجتماعي، وشارات التحقق',
      settings: {
        customUrlPrice: 10,
        businessCardPrice: 15,
        socialKitPrice: 15,
        profileThemePrice: 3,
        videoIntroPrice: 20,
        verifiedBusinessPrice: 5,
        bundleStarterPrice: 20,
        bundleSocialProPrice: 35,
        bundleFullBrandingSetupPrice: 50,
        bundleFullBrandingMonthlyPrice: 5,
        freePortfolioPhotos: 5,
        paidPortfolioPhotos: -1,
        maxVideoLengthSeconds: 30,
        customUrlPrefix: '/',
        availableCardDesigns: ['classic', 'modern', 'bold'],
        availableFrameStyles: ['none', 'gold', 'silver', 'bronze'],
        maxSocialKitDownloads: 10,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'insurance',
      name: 'Insurance Marketplace',
      nameAr: 'سوق التأمين',
      enabled: false,
      description: 'Insurance products for workers',
      descriptionAr: 'منتجات تأمين للعمال',
      settings: {},
      pricing: { type: 'percentage', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'training',
      name: 'Training & Certification',
      nameAr: 'التدريب والشهادات',
      enabled: false,
      description: 'Online courses and certifications',
      descriptionAr: 'دورات عبر الإنترنت وشهادات',
      settings: {
        courseCommissionRate: 30,
        examFee: 49.99,
        badgePrice: 19.99,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'equipment_marketplace',
      name: 'Equipment Marketplace',
      nameAr: 'سوق المعدات',
      enabled: false,
      description: 'Tool rentals and bulk purchasing',
      descriptionAr: 'تأجير الأدوات الشراء بالجملة',
      settings: {
        rentalCommissionRate: 15,
        bulkDiscountEnabled: true,
      },
      pricing: { type: 'percentage', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'whitelabel',
      name: 'White-Label Solutions',
      nameAr: 'حلول العلامات التجارية الخاصة',
      enabled: false,
      description: 'Custom branding and API access',
      descriptionAr: 'علامة تجارية مخصصة وصول API',
      settings: {
        companyBrandingPrice: 99.99,
        apiAccessPrice: 199.99,
        customIntegrationPrice: 499.99,
      },
      pricing: { type: 'fixed', currency: 'USD' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const stream of defaultStreams) {
    store.streams.set(stream.id, stream);
  }

  g[GLOBAL_KEY] = store;
  return store;
}

// ─── Stream Configuration Functions ──────────────────────────────────────────

export function getAllStreamConfigs(): RevenueStreamConfig[] {
  return Array.from(getStore().streams.values());
}

export function getStreamConfig(streamId: RevenueStreamId): RevenueStreamConfig | undefined {
  return getStore().streams.get(streamId);
}

export function isStreamEnabled(streamId: RevenueStreamId): boolean {
  const config = getStore().streams.get(streamId);
  if (!config) return false;
  
  // Check effective dates
  if (config.effectiveFrom && new Date(config.effectiveFrom) > new Date()) return false;
  if (config.effectiveUntil && new Date(config.effectiveUntil) < new Date()) return false;
  
  return config.enabled;
}

export function getStreamSetting<T>(streamId: RevenueStreamId, settingKey: string): T | undefined {
  const config = getStore().streams.get(streamId);
  if (!config) return undefined;
  return config.settings[settingKey] as T;
}

export function updateStreamConfig(
  streamId: RevenueStreamId,
  updates: Partial<RevenueStreamConfig>,
  adminId: string,
  adminName: string
): RevenueStreamConfig {
  const store = getStore();
  const existing = store.streams.get(streamId);
  if (!existing) throw new Error(`Stream ${streamId} not found`);

  const updated: RevenueStreamConfig = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  store.streams.set(streamId, updated);

  // Log audit
  const auditEntry: RevenueStreamAudit = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    streamId,
    action: 'settings_updated',
    oldValue: existing.settings,
    newValue: updated.settings,
    adminId,
    adminName,
    createdAt: new Date().toISOString(),
  };
  store.auditLog.push(auditEntry);

  return updated;
}

export function toggleStream(
  streamId: RevenueStreamId,
  enabled: boolean,
  adminId: string,
  adminName: string
): RevenueStreamConfig {
  const store = getStore();
  const existing = store.streams.get(streamId);
  if (!existing) throw new Error(`Stream ${streamId} not found`);

  const updated: RevenueStreamConfig = {
    ...existing,
    enabled,
    updatedAt: new Date().toISOString(),
  };

  store.streams.set(streamId, updated);

  // Log audit
  const auditEntry: RevenueStreamAudit = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    streamId,
    action: enabled ? 'enabled' : 'disabled',
    oldValue: { enabled: existing.enabled },
    newValue: { enabled },
    adminId,
    adminName,
    createdAt: new Date().toISOString(),
  };
  store.auditLog.push(auditEntry);

  return updated;
}

// ─── Package Management Functions ────────────────────────────────────────────

export function getCreditPackages(): CreditPackage[] {
  return getStore().creditPackages.filter(p => p.enabled);
}

export function getAllCreditPackages(): CreditPackage[] {
  return getStore().creditPackages;
}

export function updateCreditPackage(id: string, updates: Partial<CreditPackage>): CreditPackage {
  const store = getStore();
  const index = store.creditPackages.findIndex(p => p.id === id);
  if (index === -1) throw new Error(`Credit package ${id} not found`);

  store.creditPackages[index] = { ...store.creditPackages[index], ...updates };
  return store.creditPackages[index];
}

export function addCreditPackage(pkg: Omit<CreditPackage, 'id'>): CreditPackage {
  const store = getStore();
  const newPkg: CreditPackage = {
    ...pkg,
    id: `credit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  store.creditPackages.push(newPkg);
  return newPkg;
}

export function removeCreditPackage(id: string): boolean {
  const store = getStore();
  const index = store.creditPackages.findIndex(p => p.id === id);
  if (index === -1) return false;
  store.creditPackages.splice(index, 1);
  return true;
}

export function getTokenPackages(): TokenPackage[] {
  return getStore().tokenPackages.filter(p => p.enabled);
}

export function getAllTokenPackages(): TokenPackage[] {
  return getStore().tokenPackages;
}

export function updateTokenPackage(id: string, updates: Partial<TokenPackage>): TokenPackage {
  const store = getStore();
  const index = store.tokenPackages.findIndex(p => p.id === id);
  if (index === -1) throw new Error(`Token package ${id} not found`);

  store.tokenPackages[index] = { ...store.tokenPackages[index], ...updates };
  return store.tokenPackages[index];
}

export function addTokenPackage(pkg: Omit<TokenPackage, 'id'>): TokenPackage {
  const store = getStore();
  const newPkg: TokenPackage = {
    ...pkg,
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  store.tokenPackages.push(newPkg);
  return newPkg;
}

export function removeTokenPackage(id: string): boolean {
  const store = getStore();
  const index = store.tokenPackages.findIndex(p => p.id === id);
  if (index === -1) return false;
  store.tokenPackages.splice(index, 1);
  return true;
}

// ─── Commission Tier Functions ───────────────────────────────────────────────

export function getCommissionTiers(): CommissionTier[] {
  return getStore().commissionTiers.filter(t => t.enabled);
}

export function getAllCommissionTiers(): CommissionTier[] {
  return getStore().commissionTiers;
}

export function getCommissionTierForBillings(lifetimeBillings: number): CommissionTier {
  const tiers = getCommissionTiers();
  for (const tier of tiers) {
    if (lifetimeBillings >= tier.minBillings && lifetimeBillings <= tier.maxBillings) {
      return tier;
    }
  }
  // Default to first tier
  return tiers[0] || DEFAULT_COMMISSION_TIERS[0];
}

export function updateCommissionTier(id: string, updates: Partial<CommissionTier>): CommissionTier {
  const store = getStore();
  const index = store.commissionTiers.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Commission tier ${id} not found`);

  store.commissionTiers[index] = { ...store.commissionTiers[index], ...updates };
  return store.commissionTiers[index];
}

export function addCommissionTier(tier: Omit<CommissionTier, 'id'>): CommissionTier {
  const store = getStore();
  const newTier: CommissionTier = {
    ...tier,
    id: `tier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  store.commissionTiers.push(newTier);
  return newTier;
}

export function removeCommissionTier(id: string): boolean {
  const store = getStore();
  const index = store.commissionTiers.findIndex(t => t.id === id);
  if (index === -1) return false;
  store.commissionTiers.splice(index, 1);
  return true;
}

// ─── Background Check Functions ──────────────────────────────────────────────

export function getBackgroundCheckTypes(): BackgroundCheckType[] {
  return getStore().backgroundCheckTypes.filter(t => t.enabled);
}

export function getAllBackgroundCheckTypes(): BackgroundCheckType[] {
  return getStore().backgroundCheckTypes;
}

export function updateBackgroundCheckType(id: string, updates: Partial<BackgroundCheckType>): BackgroundCheckType {
  const store = getStore();
  const index = store.backgroundCheckTypes.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Background check type ${id} not found`);

  store.backgroundCheckTypes[index] = { ...store.backgroundCheckTypes[index], ...updates };
  return store.backgroundCheckTypes[index];
}

// ─── Payout Tier Functions ───────────────────────────────────────────────────

export function getPayoutTiers(): PayoutTier[] {
  return getStore().payoutTiers.filter(t => t.enabled);
}

export function getAllPayoutTiers(): PayoutTier[] {
  return getStore().payoutTiers;
}

export function updatePayoutTier(id: string, updates: Partial<PayoutTier>): PayoutTier {
  const store = getStore();
  const index = store.payoutTiers.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Payout tier ${id} not found`);

  store.payoutTiers[index] = { ...store.payoutTiers[index], ...updates };
  return store.payoutTiers[index];
}

// ─── SaaS Tool Functions ─────────────────────────────────────────────────────

export function getSaasTools(): SaasToolCatalog[] {
  return getStore().saasTools.filter(t => t.enabled);
}

export function getAllSaasTools(): SaasToolCatalog[] {
  return getStore().saasTools;
}

export function updateSaasTool(id: string, updates: Partial<SaasToolCatalog>): SaasToolCatalog {
  const store = getStore();
  const index = store.saasTools.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`SaaS tool ${id} not found`);

  store.saasTools[index] = { ...store.saasTools[index], ...updates };
  return store.saasTools[index];
}

// ─── Support Tier Functions ──────────────────────────────────────────────────

export function getSupportTiers(): SupportTier[] {
  return getStore().supportTiers.filter(t => t.enabled);
}

export function getAllSupportTiers(): SupportTier[] {
  return getStore().supportTiers;
}

export function updateSupportTier(id: string, updates: Partial<SupportTier>): SupportTier {
  const store = getStore();
  const index = store.supportTiers.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Support tier ${id} not found`);

  store.supportTiers[index] = { ...store.supportTiers[index], ...updates };
  return store.supportTiers[index];
}

// ─── Insurance Product Functions ─────────────────────────────────────────────

export function getInsuranceProducts(): InsuranceProduct[] {
  return getStore().insuranceProducts.filter(p => p.enabled);
}

export function getAllInsuranceProducts(): InsuranceProduct[] {
  return getStore().insuranceProducts;
}

export function updateInsuranceProduct(id: string, updates: Partial<InsuranceProduct>): InsuranceProduct {
  const store = getStore();
  const index = store.insuranceProducts.findIndex(p => p.id === id);
  if (index === -1) throw new Error(`Insurance product ${id} not found`);

  store.insuranceProducts[index] = { ...store.insuranceProducts[index], ...updates };
  return store.insuranceProducts[index];
}

// ─── Audit Log Functions ─────────────────────────────────────────────────────

export function getAuditLog(limit = 50): RevenueStreamAudit[] {
  return getStore().auditLog
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function getAuditLogForStream(streamId: RevenueStreamId, limit = 20): RevenueStreamAudit[] {
  return getStore().auditLog
    .filter(a => a.streamId === streamId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ─── Revenue Analytics Functions ─────────────────────────────────────────────

export interface RevenueStreamAnalytics {
  streamId: RevenueStreamId;
  streamName: string;
  totalRevenue: number;
  monthlyRevenue: number;
  transactionCount: number;
  averageTransactionValue: number;
  growthPercent: number;
}

export function getRevenueAnalytics(): RevenueStreamAnalytics[] {
  // In demo mode, return mock data
  // In production, this would query the database
  return [
    { streamId: 'credits', streamName: 'Pay-Per-Lead Credits', totalRevenue: 25000, monthlyRevenue: 2500, transactionCount: 450, averageTransactionValue: 55.56, growthPercent: 15 },
    { streamId: 'tokens', streamName: 'Application Tokens', totalRevenue: 15000, monthlyRevenue: 1500, transactionCount: 300, averageTransactionValue: 50, growthPercent: 12 },
    { streamId: 'background_checks', streamName: 'Background Checks', totalRevenue: 30000, monthlyRevenue: 3000, transactionCount: 200, averageTransactionValue: 150, growthPercent: 20 },
    { streamId: 'instant_payouts', streamName: 'Instant Payouts', totalRevenue: 10000, monthlyRevenue: 1000, transactionCount: 100, averageTransactionValue: 100, growthPercent: 8 },
    { streamId: 'saas_tools', streamName: 'SaaS Subscriptions', totalRevenue: 20000, monthlyRevenue: 2000, transactionCount: 150, averageTransactionValue: 133.33, growthPercent: 25 },
    { streamId: 'promoted_profiles', streamName: 'Promoted Profiles', totalRevenue: 40000, monthlyRevenue: 4000, transactionCount: 80, averageTransactionValue: 500, growthPercent: 30 },
  ];
}
