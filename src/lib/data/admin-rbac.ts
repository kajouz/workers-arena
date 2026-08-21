/**
 * Role-Based Access Control (RBAC) for Admin Dashboard
 */

export type AdminRole = "super_admin" | "support" | "finance" | "marketing";

export type Permission =
  | "view_analytics"
  | "manage_workers"
  | "manage_customers"
  | "process_payments"
  | "view_financials"
  | "manage_content"
  | "manage_campaigns"
  | "manage_verifications"
  | "manage_payouts"
  | "view_security"
  | "manage_settings"
  | "impersonate_users"
  | "export_data"
  | "manage_categories"
  | "send_notifications";

export interface AdminUser {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  role: AdminRole;
  permissions: Permission[];
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    "view_analytics", "manage_workers", "manage_customers", "process_payments",
    "view_financials", "manage_content", "manage_campaigns", "manage_verifications",
    "manage_payouts", "view_security", "manage_settings", "impersonate_users",
    "export_data", "manage_categories", "send_notifications",
  ],
  support: ["view_analytics", "manage_workers", "manage_customers", "manage_verifications", "impersonate_users", "export_data"],
  finance: ["view_analytics", "process_payments", "view_financials", "manage_payouts", "export_data"],
  marketing: ["view_analytics", "manage_campaigns", "manage_content", "export_data", "send_notifications"],
};

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: AdminRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function getRoleName(role: AdminRole, locale: "en" | "ar" = "en"): string {
  const names: Record<AdminRole, { en: string; ar: string }> = {
    super_admin: { en: "Super Admin", ar: "مدير عام" },
    support: { en: "Support", ar: "دعم فني" },
    finance: { en: "Finance", ar: "مالية" },
    marketing: { en: "Marketing", ar: "تسويق" },
  };
  return names[role]?.[locale] ?? role;
}

export function getPermissionName(permission: Permission, locale: "en" | "ar" = "en"): string {
  const names: Record<Permission, { en: string; ar: string }> = {
    view_analytics: { en: "View Analytics", ar: "عرض التحليلات" },
    manage_workers: { en: "Manage Workers", ar: "إدارة العمال" },
    manage_customers: { en: "Manage Customers", ar: "إدارة العملاء" },
    process_payments: { en: "Process Payments", ar: "معالجة المدفوعات" },
    view_financials: { en: "View Financials", ar: "عرض المالية" },
    manage_content: { en: "Manage Content", ar: "إدارة المحتوى" },
    manage_campaigns: { en: "Manage Campaigns", ar: "إدارة الحملات" },
    manage_verifications: { en: "Manage Verifications", ar: "إدارة التوثيق" },
    manage_payouts: { en: "Manage Payouts", ar: "إدارة المصروفات" },
    view_security: { en: "View Security", ar: "عرض الأمان" },
    manage_settings: { en: "Manage Settings", ar: "إدارة الإعدادات" },
    impersonate_users: { en: "Impersonate Users", ar: "انتحال المستخدمين" },
    export_data: { en: "Export Data", ar: "تصدير البيانات" },
    manage_categories: { en: "Manage Categories", ar: "إدارة الفئات" },
    send_notifications: { en: "Send Notifications", ar: "إرسال الإشعارات" },
  };
  return names[permission]?.[locale] ?? permission;
}

export const DEMO_ADMIN_USERS: AdminUser[] = [
  {
    id: "admin-1", name: "Super Admin", nameAr: "المدير العام", email: "admin@workersarena.com",
    role: "super_admin", permissions: ROLE_PERMISSIONS.super_admin, createdAt: "2024-01-01", lastLogin: "2024-02-15", isActive: true,
  },
  {
    id: "admin-2", name: "Support Agent", nameAr: "وكيل الدعم", email: "support@workersarena.com",
    role: "support", permissions: ROLE_PERMISSIONS.support, createdAt: "2024-01-15", lastLogin: "2024-02-14", isActive: true,
  },
  {
    id: "admin-3", name: "Finance Manager", nameAr: "مدير المالية", email: "finance@workersarena.com",
    role: "finance", permissions: ROLE_PERMISSIONS.finance, createdAt: "2024-01-20", lastLogin: "2024-02-13", isActive: true,
  },
  {
    id: "admin-4", name: "Marketing Lead", nameAr: "قائد التسويق", email: "marketing@workersarena.com",
    role: "marketing", permissions: ROLE_PERMISSIONS.marketing, createdAt: "2024-02-01", lastLogin: "2024-02-12", isActive: true,
  },
];

export function canAccessPage(role: AdminRole, page: string): boolean {
  const pagePermissions: Record<string, Permission[]> = {
    "/admin": ["view_analytics"], "/admin/revenue": ["view_financials"],
    "/admin/invoices": ["view_financials", "process_payments"], "/admin/customers": ["manage_customers"],
    "/admin/categories": ["manage_categories"], "/admin/verifications": ["manage_verifications"],
    "/admin/activity": ["view_analytics"], "/admin/security": ["view_security"],
  };
  const required = pagePermissions[page] ?? ["view_analytics"];
  return hasAnyPermission(role, required);
}
