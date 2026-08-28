import { NextResponse } from "next/server";

/**
 * GET /api/worker/payment-options
 * Returns flexible payment options including:
 * - Installment plans for large purchases
 * - Wallet top-up via OMT/Wish with bonus
 * - Business accounts for companies
 * - Payment method management
 */

interface InstallmentPlan {
  id: string;
  name: string;
  nameAr: string;
  months: number;
  monthlyPayment: number;
  totalAmount: number;
  interestRate: number;
  eligibleProducts: string[];
}

interface WalletTopUp {
  id: string;
  method: string;
  methodAr: string;
  bonus: number;
  minAmount: number;
  maxAmount: number;
  processingTime: string;
  processingTimeAr: string;
  icon: string;
}

interface BusinessAccount {
  tier: string;
  tierAr: string;
  monthlyFee: number;
  features: string[];
  featuresAr: string[];
  bulkDiscount: number;
  creditLimit: number;
  dedicatedSupport: boolean;
}

interface PaymentMethod {
  id: string;
  type: "card" | "wallet" | "bank";
  name: string;
  nameAr: string;
  last4?: string;
  isDefault: boolean;
  expiryDate?: string;
}

interface PaymentOptions {
  installmentPlans: InstallmentPlan[];
  walletTopUps: WalletTopUp[];
  businessAccounts: BusinessAccount[];
  paymentMethods: PaymentMethod[];
  walletBalance: {
    usd: number;
    lbp: number;
  };
}

function generateInstallmentPlans(): InstallmentPlan[] {
  return [
    {
      id: "plan_3",
      name: "3-Month Plan",
      nameAr: "خطة 3 أشهر",
      months: 3,
      monthlyPayment: 33.33,
      totalAmount: 100,
      interestRate: 0,
      eligibleProducts: ["Premium Subscription", "Large Credit Packs"],
    },
    {
      id: "plan_6",
      name: "6-Month Plan",
      nameAr: "خطة 6 أشهر",
      months: 6,
      monthlyPayment: 18.33,
      totalAmount: 110,
      interestRate: 10,
      eligibleProducts: [
        "Premium Subscription",
        "Large Credit Packs",
        "Annual Background Check",
      ],
    },
    {
      id: "plan_12",
      name: "12-Month Plan",
      nameAr: "خطة 12 شهر",
      months: 12,
      monthlyPayment: 10,
      totalAmount: 120,
      interestRate: 20,
      eligibleProducts: [
        "Premium Subscription",
        "Large Credit Packs",
        "Annual Background Check",
        "White-Label License",
      ],
    },
  ];
}

function generateWalletTopUps(): WalletTopUp[] {
  return [
    {
      id: "wish",
      method: "Wish",
      methodAr: "ويش",
      bonus: 5,
      minAmount: 10,
      maxAmount: 500,
      processingTime: "Instant",
      processingTimeAr: "فوري",
      icon: "💜",
    },
    {
      id: "omt",
      method: "OMT",
      methodAr: "أو إم تي",
      bonus: 3,
      minAmount: 10,
      maxAmount: 1000,
      processingTime: "1-2 hours",
      processingTimeAr: "1-2 ساعة",
      icon: "🟠",
    },
    {
      id: "card",
      method: "Credit Card",
      methodAr: "بطاقة ائتمان",
      bonus: 0,
      minAmount: 5,
      maxAmount: 2000,
      processingTime: "Instant",
      processingTimeAr: "فوري",
      icon: "💳",
    },
    {
      id: "bank",
      method: "Bank Transfer",
      methodAr: "تحويل بنكي",
      bonus: 2,
      minAmount: 50,
      maxAmount: 5000,
      processingTime: "1-3 days",
      processingTimeAr: "1-3 أيام",
      icon: "🏦",
    },
  ];
}

function generateBusinessAccounts(): BusinessAccount[] {
  return [
    {
      tier: "Startup",
      tierAr: "ناشئ",
      monthlyFee: 49,
      features: [
        "Up to 5 worker accounts",
        "Basic analytics",
        "Email support",
        "Standard API access",
      ],
      featuresAr: [
        "حتى 5 حسابات عمال",
        "تحليلات أساسية",
        "دعم عبر البريد الإلكتروني",
        "وصول API قياسي",
      ],
      bulkDiscount: 10,
      creditLimit: 1000,
      dedicatedSupport: false,
    },
    {
      tier: "Business",
      tierAr: "أعمال",
      monthlyFee: 149,
      features: [
        "Up to 25 worker accounts",
        "Advanced analytics",
        "Priority support",
        "Full API access",
        "Custom branding",
      ],
      featuresAr: [
        "حتى 25 حساب عامل",
        "تحليلات متقدمة",
        "دعم ذو أولوية",
        "وصول كامل لـ API",
        "علامة تجارية مخصصة",
      ],
      bulkDiscount: 20,
      creditLimit: 5000,
      dedicatedSupport: true,
    },
    {
      tier: "Enterprise",
      tierAr: "مؤسسات",
      monthlyFee: 499,
      features: [
        "Unlimited worker accounts",
        "Real-time analytics",
        "Dedicated account manager",
        "Custom API integrations",
        "White-label options",
        "SLA guarantee",
      ],
      featuresAr: [
        "حسابات عمال غير محدودة",
        "تحليلات في الوقت الفعلي",
        "مدير حساب مخصص",
        "تكاملات API مخصصة",
        "خيارات العلامة التجارية الخاصة",
        "ضمان اتفاقية مستوى الخدمة",
      ],
      bulkDiscount: 30,
      creditLimit: 20000,
      dedicatedSupport: true,
    },
  ];
}

function generatePaymentMethods(): PaymentMethod[] {
  return [
    {
      id: "pm_1",
      type: "card",
      name: "Visa ending in 4242",
      nameAr: "فيزا تنتهي بـ 4242",
      last4: "4242",
      isDefault: true,
      expiryDate: "12/27",
    },
    {
      id: "pm_2",
      type: "wallet",
      name: "Wish Wallet",
      nameAr: "محفظة ويش",
      isDefault: false,
    },
    {
      id: "pm_3",
      type: "bank",
      name: "Bank Audi Account",
      nameAr: "حساب بنك أودي",
      last4: "7890",
      isDefault: false,
    },
  ];
}

export async function GET() {
  try {
    const data: PaymentOptions = {
      installmentPlans: generateInstallmentPlans(),
      walletTopUps: generateWalletTopUps(),
      businessAccounts: generateBusinessAccounts(),
      paymentMethods: generatePaymentMethods(),
      walletBalance: {
        usd: 125.5,
        lbp: 11295000,
      },
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch payment options" },
      { status: 500 }
    );
  }
}
