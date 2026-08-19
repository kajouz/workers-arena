/**
 * Email digest system for weekly booking summaries.
 *
 * This module generates and sends weekly email digests to workers and customers
 * summarizing their booking activity, earnings, and upcoming schedules.
 *
 * Features:
 * - Weekly booking summary
 * - Earnings report for workers
 * - Upcoming schedule for workers
 * - Review summary for workers
 * - Customer booking history
 *
 * To enable:
 * 1. Set EMAIL_PROVIDER (smtp, sendgrid, resend)
 * 2. Configure provider-specific settings
 * 3. Add a cron job to run weekly: npm run digest:send
 */

// Simple date helpers (no external dependency needed)
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function format(date: Date, formatStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  if (formatStr === "MMM d") return `${month} ${day}`;
  if (formatStr === "MMM d, yyyy") return `${month} ${day}, ${year}`;
  return date.toLocaleDateString();
}

interface DigestRecipient {
  id: string;
  email: string;
  name: string;
  role: "worker" | "customer";
  locale: "en" | "ar";
}

interface BookingSummary {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  pendingBookings: number;
  upcomingBookings: number;
}

interface WorkerDigestData extends DigestRecipient {
  role: "worker";
  earnings: {
    total: number;
    currency: string;
    thisWeek: number;
    lastWeek: number;
  };
  bookings: BookingSummary;
  upcomingSchedule: {
    date: string;
    time: string;
    customerName: string;
    jobTitle: string;
    status: string;
  }[];
  reviews: {
    count: number;
    averageRating: number;
    newReviews: { author: string; rating: number; text: string }[];
  };
  profileViews: number;
}

interface CustomerDigestData extends DigestRecipient {
  role: "customer";
  bookings: BookingSummary;
  recentBookings: {
    workerName: string;
    jobTitle: string;
    date: string;
    status: string;
    amount: number;
    currency: string;
  }[];
  upcomingBookings: {
    workerName: string;
    jobTitle: string;
    date: string;
    time: string;
  }[];
}

type DigestData = WorkerDigestData | CustomerDigestData;

/**
 * Generate weekly digest email HTML for a worker
 */
export function generateWorkerDigestHTML(data: WorkerDigestData): string {
  const weekStart = format(startOfWeek(new Date()), "MMM d");
  const weekEnd = format(endOfWeek(new Date()), "MMM d, yyyy");

  return `
<!DOCTYPE html>
<html lang="${data.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Digest - WorkersArena</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7f6f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6b21a8, #9333ea); padding: 32px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 32px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f8fafc; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 800; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { margin: 24px 0; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    .booking-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px; }
    .booking-info { flex: 1; }
    .booking-customer { font-weight: 600; color: #1a1a2e; }
    .booking-job { font-size: 13px; color: #64748b; }
    .booking-time { font-size: 12px; color: #94a3b8; }
    .booking-status { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .status-confirmed { background: #dcfce7; color: #16a34a; }
    .status-pending { background: #fef3c7; color: #d97706; }
    .status-completed { background: #dbeafe; color: #2563eb; }
    .cta-button { display: inline-block; background: #6b21a8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 24px 32px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer a { color: #6b21a8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 ${data.locale === "ar" ? "ملخص الأسبوع" : "Weekly Digest"}</h1>
      <p>${weekStart} – ${weekEnd}</p>
    </div>
    
    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${data.earnings.thisWeek}</div>
          <div class="stat-label">${data.locale === "ar" ? "أرباح هذا الأسبوع" : "This Week's Earnings"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.bookings.upcomingBookings}</div>
          <div class="stat-label">${data.locale === "ar" ? "مواعيد قادمة" : "Upcoming Bookings"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.reviews.averageRating.toFixed(1)} ⭐</div>
          <div class="stat-label">${data.locale === "ar" ? "متوسط التقييم" : "Average Rating"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.profileViews}</div>
          <div class="stat-label">${data.locale === "ar" ? "مشاهدات الملف" : "Profile Views"}</div>
        </div>
      </div>

      ${data.upcomingSchedule.length > 0 ? `
      <div class="section">
        <h2 class="section-title">${data.locale === "ar" ? "المواعيد القادمة" : "Upcoming Schedule"}</h2>
        ${data.upcomingSchedule.slice(0, 5).map((booking) => `
        <div class="booking-item">
          <div class="booking-info">
            <div class="booking-customer">${booking.customerName}</div>
            <div class="booking-job">${booking.jobTitle}</div>
            <div class="booking-time">${booking.date} • ${booking.time}</div>
          </div>
          <span class="booking-status status-${booking.status.toLowerCase()}">${booking.status}</span>
        </div>
        `).join("")}
      </div>
      ` : ""}

      ${data.reviews.newReviews.length > 0 ? `
      <div class="section">
        <h2 class="section-title">${data.locale === "ar" ? "تقييمات جديدة" : "New Reviews"}</h2>
        ${data.reviews.newReviews.slice(0, 3).map((review) => `
        <div style="padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px;">
          <div style="font-weight: 600; color: #1a1a2e;">${review.author} - ${"⭐".repeat(review.rating)}</div>
          <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${review.text}</div>
        </div>
        `).join("")}
      </div>
      ` : ""}

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://workersarena.com/dashboard" class="cta-button">
          ${data.locale === "ar" ? "عرض لوحة التحكم" : "View Dashboard"}
        </a>
      </div>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} WorkersArena</p>
      <p>
        <a href="https://workersarena.com/settings/notifications">${data.locale === "ar" ? "إدارة تفضيلات الإشعارات" : "Manage notification preferences"}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate weekly digest email HTML for a customer
 */
export function generateCustomerDigestHTML(data: CustomerDigestData): string {
  const weekStart = format(startOfWeek(new Date()), "MMM d");
  const weekEnd = format(endOfWeek(new Date()), "MMM d, yyyy");

  return `
<!DOCTYPE html>
<html lang="${data.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Digest - WorkersArena</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7f6f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #059669, #10b981); padding: 32px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 32px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f8fafc; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 800; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { margin: 24px 0; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    .booking-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px; }
    .booking-info { flex: 1; }
    .booking-worker { font-weight: 600; color: #1a1a2e; }
    .booking-job { font-size: 13px; color: #64748b; }
    .booking-time { font-size: 12px; color: #94a3b8; }
    .booking-amount { font-weight: 700; color: #059669; }
    .cta-button { display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 24px 32px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer a { color: #059669; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 ${data.locale === "ar" ? "ملخص الأسبوع" : "Weekly Digest"}</h1>
      <p>${weekStart} – ${weekEnd}</p>
    </div>
    
    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${data.bookings.totalBookings}</div>
          <div class="stat-label">${data.locale === "ar" ? "إجمالي الحجوزات" : "Total Bookings"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.bookings.upcomingBookings}</div>
          <div class="stat-label">${data.locale === "ar" ? "مواعيد قادمة" : "Upcoming Bookings"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.bookings.completedBookings}</div>
          <div class="stat-label">${data.locale === "ar" ? "مكتملة" : "Completed"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${data.bookings.pendingBookings}</div>
          <div class="stat-label">${data.locale === "ar" ? "قيد الانتظار" : "Pending"}</div>
        </div>
      </div>

      ${data.upcomingBookings.length > 0 ? `
      <div class="section">
        <h2 class="section-title">${data.locale === "ar" ? "المواعيد القادمة" : "Upcoming Bookings"}</h2>
        ${data.upcomingBookings.slice(0, 5).map((booking) => `
        <div class="booking-item">
          <div class="booking-info">
            <div class="booking-worker">${booking.workerName}</div>
            <div class="booking-job">${booking.jobTitle}</div>
            <div class="booking-time">${booking.date} • ${booking.time}</div>
          </div>
        </div>
        `).join("")}
      </div>
      ` : ""}

      ${data.recentBookings.length > 0 ? `
      <div class="section">
        <h2 class="section-title">${data.locale === "ar" ? "الحجوزات الأخيرة" : "Recent Bookings"}</h2>
        ${data.recentBookings.slice(0, 3).map((booking) => `
        <div class="booking-item">
          <div class="booking-info">
            <div class="booking-worker">${booking.workerName}</div>
            <div class="booking-job">${booking.jobTitle}</div>
            <div class="booking-time">${booking.date}</div>
          </div>
          <div class="booking-amount">${booking.amount} ${booking.currency}</div>
        </div>
        `).join("")}
      </div>
      ` : ""}

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://workersarena.com/bookings" class="cta-button">
          ${data.locale === "ar" ? "عرض الحجوزات" : "View Bookings"}
        </a>
      </div>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} WorkersArena</p>
      <p>
        <a href="https://workersarena.com/settings/notifications">${data.locale === "ar" ? "إدارة تفضيلات الإشعارات" : "Manage notification preferences"}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send digest email (placeholder - integrate with your email provider)
 */
export async function sendDigestEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  // In production, integrate with:
  // - SendGrid: @sendgrid/mail
  // - Resend: resend
  // - AWS SES
  // - Nodemailer (SMTP)

  console.log(`[Digest] Would send email to ${to}: ${subject}`);
  return true;
}
