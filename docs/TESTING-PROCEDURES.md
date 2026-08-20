# WorkersArena — Application Testing Procedures

**Document Version:** 1.0  
**Date:** August 19, 2026  
**Prepared by:** QA Team  
**Application:** WorkersArena Marketplace Platform

---

## Table of Contents

1. [Pre-Testing Setup](#1-pre-testing-setup)
2. [Authentication & Authorization Testing](#2-authentication--authorization-testing)
3. [Homepage & Navigation Testing](#3-homepage--navigation-testing)
4. [Search & Discovery Testing](#4-search--discovery-testing)
5. [Worker Profile Testing](#5-worker-profile-testing)
6. [Booking & Scheduling Testing](#6-booking--scheduling-testing)
7. [Dashboard Testing — Worker](#7-dashboard-testing--worker)
8. [Dashboard Testing — Admin](#8-dashboard-testing--admin)
9. [Dashboard Testing — Company](#9-dashboard-testing--company)
10. [Notifications Testing](#10-notifications-testing)
11. [Payments & Billing Testing](#11-payments--billing-testing)
12. [Forum & Q&A Testing](#12-forum--qa-testing)
13. [Help Center & Support Testing](#13-help-center--support-testing)
14. [Messaging & Chat Testing](#14-messaging--chat-testing)
15. [SEO & Performance Testing](#15-seo--performance-testing)
16. [PWA & Offline Testing](#16-pwa--offline-testing)
17. [Mobile Responsiveness Testing](#17-mobile-responsiveness-testing)
18. [Accessibility Testing](#18-accessibility-testing)
19. [Security Testing](#19-security-testing)
20. [API Endpoint Testing](#20-api-endpoint-testing)
21. [Verification Testing](#21-verification-testing)
22. [Geolocation Near Me Testing](#22-geolocation-near-me-testing)
23. [Worker Earnings Dashboard Testing](#23-worker-earnings-dashboard-testing)
24. [Dispute Resolution Testing](#24-dispute-resolution-testing)
25. [Performance & SEO Audit Testing](#25-performance--seo-audit-testing)
26. [Analytics & CI/CD Testing](#26-analytics--cicd-testing)

---

## 1. Pre-Testing Setup

### 1.1 Environment Preparation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1.1 | Clone the repository from GitHub | Repository cloned successfully |
| 1.1.2 | Run `npm install` to install dependencies | All dependencies installed without errors |
| 1.1.3 | Copy `.env.example` to `.env.local` | Environment file created |
| 1.1.4 | Verify `DEMO_MODE=true` is set | Application runs in demo mode |
| 1.1.5 | Run `npm run dev` to start development server | Server starts on port 3000 |
| 1.1.6 | Open browser and navigate to `http://localhost:3000` | Homepage loads successfully |

### 1.2 Test Data

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.2.1 | Verify demo users are available | 4 demo users (Customer, Worker, Admin, Company) |
| 1.2.2 | Verify demo workers are seeded | Workers with profiles, services, and reviews |
| 1.2.3 | Verify demo categories are seeded | 21+ categories with bilingual names |
| 1.2.4 | Verify demo cities are seeded | Cities in Lebanon, KSA, Emirates, Morocco |

### 1.3 Browser Requirements

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | Required |
| Firefox | Latest | Required |
| Safari | Latest | Required |
| Edge | Latest | Required |
| Mobile Chrome | Latest | Required |
| Mobile Safari | Latest | Required |

---

## 2. Authentication & Authorization Testing

### 2.1 Demo Mode Login

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1.1 | Navigate to `/auth/login` | Login page loads with demo buttons |
| 2.1.2 | Click "Login as Customer" button | Redirects to homepage, user icon shows customer |
| 2.1.3 | Click "Login as Worker" button | Redirects to homepage, user icon shows worker |
| 2.1.4 | Click "Login as Admin" button | Redirects to homepage, user icon shows admin |
| 2.1.5 | Click "Login as Company" button | Redirects to homepage, user icon shows company |
| 2.1.6 | Click logout button | User is logged out, homepage shows login link |

### 2.2 Registration Flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.2.1 | Navigate to `/auth/register` | Registration form loads |
| 2.2.2 | Fill in name, email, password | Fields accept input |
| 2.2.3 | Submit registration form | User account created, redirected to login |
| 2.2.4 | Login with new credentials | Successful login |

### 2.3 Role-Based Access Control

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.3.1 | Login as Customer, navigate to `/dashboard` | Redirected to homepage (unauthorized) |
| 2.3.2 | Login as Worker, navigate to `/admin` | Redirected to homepage (unauthorized) |
| 2.3.3 | Login as Admin, navigate to `/dashboard` | Access granted to admin dashboard |
| 2.3.4 | Login as Worker, navigate to `/dashboard` | Access granted to worker dashboard |
| 2.3.5 | Login as Company, navigate to `/company` | Access granted to company dashboard |

### 2.4 Password Validation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.4.1 | Try registering with weak password | Error message shown |
| 2.4.2 | Try registering with mismatched passwords | Error message shown |
| 2.4.3 | Try registering with invalid email | Error message shown |

---

## 3. Homepage & Navigation Testing

### 3.1 Homepage Components

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1.1 | Verify hero section loads | Hero with search bar visible |
| 3.1.2 | Verify featured workers section | 6+ featured workers displayed |
| 3.1.3 | Verify categories grid | 21+ categories with icons |
| 3.1.4 | Verify subscription plans | Plans with pricing visible |
| 3.1.5 | Verify footer links | All footer links work |

### 3.2 Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.2.1 | Click logo | Navigates to homepage |
| 3.2.2 | Click "Search" in nav | Navigates to search page |
| 3.2.3 | Click "Categories" in nav | Navigates to categories page |
| 3.2.4 | Click "Bookings" in nav | Navigates to bookings page |
| 3.2.5 | Click user menu | Dropdown shows with profile, dashboard, logout |

### 3.3 Language Switching

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.3.1 | Click language toggle (EN/AR) | Page reloads in selected language |
| 3.3.2 | Verify Arabic RTL layout | Text direction switches to RTL |
| 3.3.3 | Verify all text translates | All UI elements show Arabic text |
| 3.3.4 | Switch back to English | Layout returns to LTR |

### 3.4 Dark Mode

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.4.1 | Click theme toggle | Switches to dark mode |
| 3.4.2 | Verify dark background | All sections have dark theme |
| 3.4.3 | Verify text readability | Text is readable on dark background |
| 3.4.4 | Switch back to light mode | Returns to light theme |
| 3.4.5 | Refresh page | Theme persists after refresh |

---

## 4. Search & Discovery Testing

### 4.1 Basic Search

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1.1 | Type "plumber" in search bar | Autocomplete suggestions appear |
| 4.1.2 | Press Enter or click search | Search results page loads |
| 4.1.3 | Verify results count | Results count displayed |
| 4.1.4 | Verify worker cards | Worker cards show name, rating, price |

### 4.2 Search Filters

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.2.1 | Select "Plumbing" category filter | Only plumbing workers shown |
| 4.2.2 | Select "Beirut" city filter | Only Beirut workers shown |
| 4.2.3 | Set minimum rating to 4.0 | Only 4+ star workers shown |
| 4.2.4 | Set price range filter | Workers in price range shown |
| 4.2.5 | Toggle "Verified" filter | Only verified workers shown |
| 4.2.6 | Toggle "Emergency" filter | Only emergency-available workers shown |
| 4.2.7 | Clear all filters | All workers shown again |

### 4.3 Search Sorting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.3.1 | Sort by "Relevance" | Results ordered by relevance |
| 4.3.2 | Sort by "Rating" | Results ordered by rating |
| 4.3.3 | Sort by "Reviews" | Results ordered by review count |
| 4.3.4 | Sort by "Price (Low)" | Results ordered by price ascending |
| 4.3.5 | Sort by "Price (High)" | Results ordered by price descending |
| 4.3.6 | Sort by "Experience" | Results ordered by years of experience |

### 4.4 Search Autocomplete

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.4.1 | Type "pl" in search | Suggestions include "Plumber" |
| 4.4.2 | Type "Beir" in search | Suggestions include "Beirut" |
| 4.4.3 | Type "elec" in search | Suggestions include "Electrician" |
| 4.4.4 | Click a suggestion | Search executes with that term |

### 4.5 Search History

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.5.1 | Perform a search | Search term saved to history |
| 4.5.2 | Click search bar again | Recent searches shown |
| 4.5.3 | Click a recent search | Re-executes that search |

### 4.6 Voice Search

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.6.1 | Click microphone icon | Voice search activates |
| 4.6.2 | Say "plumber in Beirut" | Voice recognized, search executed |
| 4.6.3 | Verify results | Results match spoken query |

---

## 5. Worker Profile Testing

### 5.1 Profile Page Load

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1.1 | Click a worker card from search | Worker profile page loads |
| 5.1.2 | Verify hero section | Cover art, name, tagline visible |
| 5.1.3 | Verify profile tabs | Overview, Services, Reviews, Gallery tabs |

### 5.2 Profile Information

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.2.1 | Verify bilingual name | Name shows in both languages |
| 5.2.2 | Verify bio section | Bio text displayed |
| 5.2.3 | Verify rating and reviews | Star rating and review count shown |
| 5.2.4 | Verify experience years | Years of experience displayed |

### 5.3 Services & Pricing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.3.1 | Click "Services" tab | Services list displayed |
| 5.3.2 | Verify service names | All services with prices shown |
| 5.3.3 | Verify price formatting | Prices shown in correct currency |

### 5.4 Reviews

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.4.1 | Click "Reviews" tab | Reviews list displayed |
| 5.4.2 | Verify review cards | Reviewer name, rating, text, date shown |
| 5.4.3 | Submit a review (logged in as customer) | Review appears in list |

### 5.5 Contact Actions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.5.1 | Click "Call" button | Phone dialer opens |
| 5.5.2 | Click "WhatsApp" button | WhatsApp opens with pre-filled message |
| 5.5.3 | Click "Email" button | Email client opens |
| 5.5.4 | Click "Message" button | Chat window opens |

### 5.6 QR Code & Sharing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.6.1 | Click QR code button | QR code displayed |
| 5.6.2 | Download QR code | PNG file downloaded |
| 5.6.3 | Click share button | Share options appear |
| 5.6.4 | Share to Facebook | Facebook share dialog opens |
| 5.6.5 | Copy link | Link copied to clipboard |

### 5.7 Favorites

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.7.1 | Click heart icon | Worker added to favorites |
| 5.7.2 | Navigate to `/favorites` | Worker appears in favorites list |
| 5.7.3 | Click heart icon again | Worker removed from favorites |

### 5.8 Portfolio Gallery

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.8.1 | View gallery section | Portfolio images displayed |
| 5.8.2 | Click an image | Lightbox opens with full image |
| 5.8.3 | Navigate between images | Previous/next navigation works |
| 5.8.4 | Close lightbox | Returns to profile page |

### 5.9 Availability Calendar

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.9.1 | View availability section | Calendar shows 7-day view |
| 5.9.2 | Verify time slots | Available slots shown in green |
| 5.9.3 | Verify booked slots | Booked slots shown in red |
| 5.9.4 | Navigate to next week | Calendar advances 7 days |

### 5.10 Certificate Verification

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.10.1 | View certifications section | Certificate badges shown |
| 5.10.2 | Click a certificate | Details dialog opens |
| 5.10.3 | Verify issuer and year | Certificate details displayed |

---

## 6. Booking & Scheduling Testing

### 6.1 Booking Flow — Customer

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1.1 | Navigate to worker profile | Profile loads |
| 6.1.2 | Click "Book Now" or "Get Quote" | Booking dialog opens |
| 6.1.3 | Step 1: Select service | Service list displayed |
| 6.1.4 | Select a service | Service highlighted |
| 6.1.5 | Click "Next" | Advances to slot selection |
| 6.1.6 | Step 2: Select time slot | Available slots shown |
| 6.1.7 | Select a slot | Slot highlighted |
| 6.1.8 | Click "Next" | Advances to details |
| 6.1.9 | Step 3: Enter job details | Form with description, address |
| 6.1.10 | Fill in job description | Text accepted |
| 6.1.11 | Fill in address | Address accepted |
| 6.1.12 | Click "Submit Request" | Booking created, confirmation shown |

### 6.2 Booking Status — Customer

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.2.1 | Navigate to `/bookings` | Bookings page loads |
| 6.2.2 | Verify "Upcoming" tab | New booking shows as REQUESTED |
| 6.2.3 | Verify booking details | Service, date, time, worker shown |
| 6.2.4 | Click booking card | Booking details expand |

### 6.3 Booking Response — Worker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.3.1 | Login as Worker, go to dashboard | Dashboard loads |
| 6.3.2 | Click "Bookings" tab | Bookings panel shows |
| 6.3.3 | Verify "Requests" tab | New booking request shown |
| 6.3.4 | Click on request | Respond dialog opens |
| 6.3.5 | Enter quote amount | Price field accepts input |
| 6.3.6 | Click "Accept" | Booking status changes to CONFIRMED |
| 6.3.7 | Verify notification sent | Customer receives confirmation |

### 6.4 Booking Decline — Worker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.4.1 | Click "Decline" on a request | Decline dialog opens |
| 6.4.2 | Enter decline reason | Reason field accepts input |
| 6.4.3 | Click "Decline" | Booking status changes to CANCELLED |
| 6.4.4 | Verify slot freed | Slot becomes AVAILABLE again |

### 6.5 Multi-Candidate Quotes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.5.1 | Click "Get Quotes" on worker profile | Quote request dialog opens |
| 6.5.2 | Select up to 3 workers | Workers selected |
| 6.5.3 | Submit quote request | Requests sent to selected workers |
| 6.5.4 | Login as invited worker | Quote request appears in dashboard |
| 6.5.5 | Submit a quote | Quote submitted |
| 6.5.6 | Login as customer, view quotes | All quotes displayed side-by-side |
| 6.5.7 | Select a winner | Winner notified, others declined |

### 6.6 Booking Lifecycle

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.6.1 | Worker starts job | Status changes to IN_PROGRESS |
| 6.6.2 | Worker completes job | Status changes to COMPLETION_PENDING |
| 6.6.3 | Customer confirms completion | Status changes to COMPLETED |
| 6.6.4 | Verify auto-confirm (72h) | Auto-confirms if customer doesn't respond |

---

## 7. Dashboard Testing — Worker

### 7.1 Dashboard Overview

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1.1 | Login as Worker, navigate to `/dashboard` | Dashboard loads with stats |
| 7.1.2 | Verify profile views count | View count displayed |
| 7.1.3 | Verify booking stats | Bookings count shown |
| 7.1.4 | Verify earnings summary | Earnings displayed |

### 7.2 Profile Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.2.1 | Click "Edit Profile" | Profile editor opens |
| 7.2.2 | Update name | Name updated |
| 7.2.3 | Update bio | Bio updated |
| 7.2.4 | Update services | Services list updated |
| 7.2.5 | Save changes | Changes saved, profile updated |

### 7.3 Availability Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.3.1 | Click "Manage Availability" | Calendar editor opens |
| 7.3.2 | Generate slots for next week | Slots created |
| 7.3.3 | Block a slot | Slot marked as BLOCKED |
| 7.3.4 | Unblock a slot | Slot marked as AVAILABLE |

### 7.4 Subscription Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.4.1 | View subscription status | Current plan shown |
| 7.4.2 | Click "Renew" | Renewal dialog opens |
| 7.4.3 | Select plan | Plan highlighted |
| 7.4.4 | Process payment | Payment processed, subscription renewed |

### 7.5 Verification Submission

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.5.1 | Click "Submit Verification" | Verification form opens |
| 7.5.2 | Upload certificate | Document uploaded |
| 7.5.3 | Submit for review | Status changes to PENDING_VERIFICATION |
| 7.5.4 | Wait for admin approval | Status changes to VERIFIED |

---

## 8. Dashboard Testing — Admin

### 8.1 Analytics Dashboard

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1.1 | Login as Admin, navigate to `/admin` | Admin dashboard loads |
| 8.1.2 | Verify KPI cards | Total users, workers, bookings shown |
| 8.1.3 | Verify revenue chart | Revenue chart displays data |
| 8.1.4 | Verify category breakdown | Category bar chart shown |
| 8.1.5 | Verify top workers list | Top workers by rating displayed |

### 8.2 Worker Verification Queue

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.2.1 | Click "Verification Queue" | Pending verifications shown |
| 8.2.2 | Click a worker | Verification details shown |
| 8.2.3 | Click "Approve" | Worker status changes to VERIFIED |
| 8.2.4 | Verify notification sent | Worker receives approval notification |
| 8.2.5 | Click "Reject" on another | Rejection dialog opens |
| 8.2.6 | Enter rejection reason | Reason accepted |
| 8.2.7 | Confirm rejection | Worker status changes to REJECTED |

### 8.3 Activity Feed

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.3.1 | View "Recent Activity" | Activity feed shows |
| 8.3.2 | Verify activity entries | Entries show actor, action, timestamp |
| 8.3.3 | Click an entry | Navigates to relevant page |

### 8.4 Search Trends

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.4.1 | View "Search Trends" card | Top searches displayed |
| 8.4.2 | Verify trend data | Search terms with counts shown |

### 8.5 Push Subscription Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.5.1 | Navigate to `/admin/push-subscriptions` | Subscriptions list loads |
| 8.5.2 | View active subscriptions | Active subscriptions shown |
| 8.5.3 | Send test push notification | Notification received on device |

---

## 9. Dashboard Testing — Company

### 9.1 Ad Campaign Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 9.1.1 | Login as Company, navigate to `/company` | Company dashboard loads |
| 9.1.2 | Click "Create Campaign" | Campaign builder opens |
| 9.1.3 | Select ad type (banner, slider, etc.) | Ad type selected |
| 9.1.4 | Set targeting (category, city) | Targeting options set |
| 9.1.5 | Set budget | Budget entered |
| 9.1.6 | Submit campaign | Campaign created in PENDING status |

### 9.2 Campaign Performance

| Step | Action | Expected Result |
|------|--------|-----------------|
| 9.2.1 | View campaign list | All campaigns shown |
| 9.2.2 | Click a campaign | Campaign details displayed |
| 9.2.3 | Verify impressions count | Impressions tracked |
| 9.2.4 | Verify clicks count | Clicks tracked |
| 9.2.5 | Verify CTR | Click-through rate calculated |

---

## 10. Notifications Testing

### 10.1 In-App Notifications

| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.1.1 | Click notification bell icon | Notification inbox opens |
| 10.1.2 | Verify unread count badge | Unread count shown |
| 10.1.3 | Click a notification | Notification marked as read |
| 10.1.4 | Click "Mark All as Read" | All notifications marked read |

### 10.2 Notification Types

| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.2.1 | Receive new booking request | Notification with booking details |
| 10.2.2 | Receive booking confirmation | Confirmation notification |
| 10.2.3 | Receive new review | Review notification |
| 10.2.4 | Receive subscription reminder | Reminder notification |
| 10.2.5 | Receive verification status | Status update notification |

### 10.3 Push Notifications

| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.3.1 | Allow push notifications | Subscription registered |
| 10.3.2 | Trigger a notification | Push notification received |
| 10.3.3 | Click push notification | App opens to relevant page |

---

## 11. Payments & Billing Testing

### 11.1 Currency Selection

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.1.1 | Click currency selector | Dropdown shows LBP, USD, SAR, EUR, GBP |
| 11.1.2 | Select "USD" | All prices shown in USD |
| 11.1.3 | Select "LBP" | All prices shown in LBP |
| 11.1.4 | Verify conversion | Prices correctly converted |

### 11.2 Subscription Payment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.2.1 | Select subscription plan | Plan selected |
| 11.2.2 | Choose payment method | OMT, Whish, or Stripe shown |
| 11.2.3 | Enter payment details | Details accepted |
| 11.2.4 | Submit payment | Payment processed |
| 11.2.5 | Verify invoice | Invoice generated |

### 11.3 Deposit Payment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.3.1 | Accept booking with deposit | Payment row created |
| 11.3.2 | Customer clicks "Pay Deposit" | Checkout page loads |
| 11.3.3 | Complete payment | Payment confirmed |
| 11.3.4 | Verify booking status | Status changes to CONFIRMED |

---

## 12. Forum & Q&A Testing

### 12.1 Forum Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.1.1 | Navigate to forum section | Forum page loads |
| 12.1.2 | View categories list | 12 categories shown |
| 12.1.3 | Click a category | Posts filtered by category |

### 12.2 Post Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.2.1 | Click "New Post" | Post creation form opens |
| 12.2.2 | Enter title | Title field accepts input |
| 12.2.3 | Enter body | Rich text editor works |
| 12.2.4 | Select category | Category selected |
| 12.2.5 | Submit post | Post created and displayed |

### 12.3 Post Interaction

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.3.1 | Click a post | Post detail page loads |
| 12.3.2 | Upvote a post | Vote count increases |
| 12.3.3 | Downvote a post | Vote count decreases |
| 12.3.4 | Submit an answer | Answer appears below post |

### 12.4 Answer Management

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.4.1 | Upvote an answer | Answer vote count increases |
| 12.4.2 | Mark answer as accepted | Answer marked as accepted |
| 12.4.3 | Verify accepted badge | Green checkmark shown |

---

## 13. Help Center & Support Testing

### 13.1 FAQ Section

| Step | Action | Expected Result |
|------|--------|-----------------|
| 13.1.1 | Navigate to help center | Help center loads |
| 13.1.2 | View FAQ section | FAQ questions listed |
| 13.1.3 | Click a question | Answer expands |
| 13.1.4 | Click again | Answer collapses |

### 13.2 Help Articles

| Step | Action | Expected Result |
|------|--------|-----------------|
| 13.2.1 | Click "Articles" tab | Articles list shown |
| 13.2.2 | Search articles | Articles filtered |
| 13.2.3 | Click an article | Article content displayed |

### 13.3 Support Tickets

| Step | Action | Expected Result |
|------|--------|-----------------|
| 13.3.1 | Click "Submit Ticket" | Ticket form opens |
| 13.3.2 | Select category | Category selected |
| 13.3.3 | Enter subject | Subject accepted |
| 13.3.4 | Enter description | Description accepted |
| 13.3.5 | Submit ticket | Ticket created |

---

## 14. Messaging & Chat Testing

### 14.1 Chat Window

| Step | Action | Expected Result |
|------|--------|-----------------|
| 14.1.1 | Click "Message" on worker profile | Chat window opens |
| 14.1.2 | Type a message | Message input accepts text |
| 14.1.3 | Press Enter | Message sent |
| 14.1.4 | Verify message appears | Message shown in chat |

### 14.2 Chat Features

| Step | Action | Expected Result |
|------|--------|-----------------|
| 14.2.1 | Verify typing indicator | "Typing..." shown when other types |
| 14.2.2 | Verify read receipts | Double checkmark shown |
| 14.2.3 | Verify online status | Online/offline indicator shown |
| 14.2.4 | Click phone call button | Phone dialer opens |
| 14.2.5 | Click video call button | Video call initiates |

### 14.3 Real-time Updates

| Step | Action | Expected Result |
|------|--------|-----------------|
| 14.3.1 | Open chat in two browsers | Messages sync in real-time |
| 14.3.2 | Send message from one | Appears in other instantly |

---

## 15. SEO & Performance Testing

### 15.1 Meta Tags

| Step | Action | Expected Result |
|------|--------|-----------------|
| 15.1.1 | View page source of homepage | Title and meta description present |
| 15.1.2 | Check Open Graph tags | OG tags present for social sharing |
| 15.1.3 | Check worker profile page | Worker-specific meta tags |

### 15.2 Structured Data

| Step | Action | Expected Result |
|------|--------|-----------------|
| 15.2.1 | View page source of worker profile | JSON-LD schema present |
| 15.2.2 | Validate with Google tool | No validation errors |

### 15.3 Sitemap & Robots

| Step | Action | Expected Result |
|------|--------|-----------------|
| 15.3.1 | Navigate to `/sitemap.xml` | XML sitemap loads |
| 15.3.2 | Verify worker URLs included | All worker pages in sitemap |
| 15.3.3 | Navigate to `/robots.txt` | Robots.txt loads |
| 15.3.4 | Verify rules | Public pages allowed, admin blocked |

### 15.4 Performance Metrics

| Step | Action | Expected Result |
|------|--------|-----------------|
| 15.4.1 | Run Lighthouse audit | Score ≥ 90 for Performance |
| 15.4.2 | Check First Contentful Paint | FCP < 1.8 seconds |
| 15.4.3 | Check Largest Contentful Paint | LCP < 2.5 seconds |
| 15.4.4 | Check Cumulative Layout Shift | CLS < 0.1 |

---

## 16. PWA & Offline Testing

### 16.1 PWA Installation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 16.1.1 | Visit site in Chrome | Install prompt appears |
| 16.1.2 | Click "Install" | App installed |
| 16.1.3 | Open installed app | Standalone mode |

### 16.2 Offline Functionality

| Step | Action | Expected Result |
|------|--------|-----------------|
| 16.2.1 | Load site while online | Shell cached |
| 16.2.2 | Go offline (DevTools) | Offline indicator shown |
| 16.2.3 | Navigate to cached page | Page loads from cache |
| 16.2.4 | Try uncached page | Offline page shown |
| 16.2.5 | Submit form offline | Queued for sync |
| 16.2.6 | Go back online | Queued actions submitted |

### 16.3 Service Worker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 16.3.1 | Check DevTools > Application | Service worker registered |
| 16.3.2 | View cached assets | Shell assets cached |
| 16.3.3 | Verify precached pages | Worker profiles cached |

---

## 17. Mobile Responsiveness Testing

### 17.1 Viewport Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.1.1 | Test at 320px width | Layout adapts, no overflow |
| 17.1.2 | Test at 375px width | Mobile layout correct |
| 17.1.3 | Test at 768px width | Tablet layout correct |
| 17.1.4 | Test at 1024px width | Desktop layout correct |

### 17.2 Touch Interactions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.2.1 | Tap buttons | Buttons respond to touch |
| 17.2.2 | Swipe gallery | Gallery swipeable |
| 17.2.3 | Pull to refresh | Refresh gesture works |

### 17.3 Mobile Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.3.1 | Verify hamburger menu | Menu icon visible |
| 17.3.2 | Tap hamburger | Menu slides open |
| 17.3.3 | Tap a link | Navigates and closes menu |

---

## 18. Accessibility Testing

### 18.1 Keyboard Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 18.1.1 | Press Tab through page | Focus moves logically |
| 18.1.2 | Press Enter on focused button | Button activates |
| 18.1.3 | Press Escape on modal | Modal closes |
| 18.1.4 | Verify focus visible | Focus ring shown |

### 18.2 Screen Reader

| Step | Action | Expected Result |
|------|--------|-----------------|
| 18.2.1 | Navigate with screen reader | All content announced |
| 18.2.2 | Verify ARIA labels | Labels present on interactive elements |
| 18.2.3 | Verify heading hierarchy | H1 > H2 > H3 logical structure |

### 18.3 Color Contrast

| Step | Action | Expected Result |
|------|--------|-----------------|
| 18.3.1 | Run WCAG audit tool | Score ≥ 90% |
| 18.3.2 | Check text contrast | Ratio ≥ 4.5:1 |
| 18.3.3 | Check interactive elements | Clear visual focus |

### 18.4 Skip Navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 18.4.1 | Press Tab on first load | Skip link appears |
| 18.4.2 | Press Enter on skip link | Focus jumps to main content |

---

## 19. Security Testing

### 19.1 Input Validation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 19.1.1 | Enter script tag in search | Input sanitized, no XSS |
| 19.1.2 | Enter SQL injection in form | Input rejected |
| 19.1.3 | Enter very long input | Input truncated or rejected |

### 19.2 Authentication Security

| Step | Action | Expected Result |
|------|--------|-----------------|
| 19.2.1 | Try accessing protected route | Redirected to login |
| 19.2.2 | Try accessing API without auth | 401 Unauthorized |
| 19.2.3 | Verify CSRF protection | CSRF token validated |

### 19.3 Rate Limiting

| Step | Action | Expected Result |
|------|--------|-----------------|
| 19.3.1 | Make 10 rapid login attempts | Rate limit triggered |
| 19.3.2 | Verify error message | "Too many requests" shown |

---

## 20. API Endpoint Testing

### 20.1 Workers API

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.1.1 | `GET /api/workers` | Returns paginated workers |
| 20.1.2 | `GET /api/workers?category=plumbing` | Filters by category |
| 20.1.3 | `GET /api/workers?city=beirut` | Filters by city |
| 20.1.4 | `GET /api/workers?rating=4.5` | Filters by rating |

### 20.2 Search API

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.2.1 | `GET /api/search/suggest?q=plum` | Returns suggestions |
| 20.2.2 | `GET /api/categories` | Returns all categories |

### 20.3 Forum API

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.3.1 | `GET /api/forum` | Returns forum posts |
| 20.3.2 | `GET /api/forum?category=plumbing` | Filters by category |

### 20.4 Health Check

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.4.1 | `GET /api/health` | Returns `{"status": "ok"}` |

### 20.5 Notifications API

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.5.1 | `GET /api/notifications` | Returns notifications (200 or 401) |

---

## Appendix A: Test Data Cleanup

After testing, reset the application:

| Step | Action | Command |
|------|--------|---------|
| A.1 | Stop development server | Ctrl+C |
| A.2 | Reset demo data | `npm run demo:reset` |
| A.3 | Clear browser data | Clear localStorage and cookies |
| A.4 | Restart server | `npm run dev` |

## Appendix B: Bug Report Template

When logging bugs, include:

1. **Title:** Brief description
2. **Steps to Reproduce:** Numbered steps
3. **Expected Result:** What should happen
4. **Actual Result:** What actually happens
5. **Environment:** Browser, OS, screen size
6. **Screenshots/Video:** If applicable
7. **Priority:** Critical / High / Medium / Low

## 21. Verification Testing

### 21.1 Email Verification
| Step | Action | Expected Result |
|------|--------|-----------------|
| 21.1.1 | Navigate to verification panel | Email tab selected by default |
| 21.1.2 | Enter email address | Input accepts valid email format |
| 21.1.3 | Click send code | Success toast: "Code sent!" |
| 21.1.4 | Check console | 6-digit code logged |
| 21.1.5 | Enter code in OTP inputs | Auto-advance on digit entry |
| 21.1.6 | Enter correct code | Verified badge appears, toast: "Verified!" |
| 21.1.7 | Enter wrong code | Error toast with remaining attempts |
| 21.1.8 | Wait 10 minutes | Resend button becomes active |

### 21.2 Phone Verification
| Step | Action | Expected Result |
|------|--------|-----------------|
| 21.2.1 | Click Phone tab | Phone input displayed |
| 21.2.2 | Enter phone in E.164 format | Input accepts + prefix |
| 21.2.3 | Send and verify code | Same flow as email |

### 21.3 WhatsApp Verification
| Step | Action | Expected Result |
|------|--------|-----------------|
| 21.3.1 | Click WhatsApp tab | WhatsApp input displayed |
| 21.3.2 | Enter phone number | Input accepts phone format |
| 21.3.3 | Send and verify | Code sent via WhatsApp channel |

---

## 22. Geolocation Near Me Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 22.1 | Navigate to search page | Search page loads |
| 22.2 | Click "Near Me" button | Browser location prompt appears |
| 22.3 | Allow location | Map pins show nearby workers |
| 22.4 | Select 5km radius | Workers within 5km shown |
| 22.5 | Select 25km radius | More workers appear |
| 22.6 | Deny location | Error message with instructions |
| 22.7 | Workers sorted by distance | Nearest worker first |
| 22.8 | Toggle Near Me off | All workers shown again |

---

## 23. Worker Earnings Dashboard Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 23.1 | Navigate to worker dashboard | Earnings section visible |
| 23.2 | Check summary cards | Total, Pending, This Month, Withdrawn shown |
| 23.3 | View monthly chart | Bar chart with 8 months of data |
| 23.4 | Toggle Monthly/Yearly | Chart updates |
| 23.5 | Check payout methods | OMT, Whish, Bank listed |
| 23.6 | Click Withdraw | Withdrawal dialog opens |
| 23.7 | View transaction list | All transactions with status |
| 23.8 | Click Export | CSV/PDF export downloads |

---

## 24. Dispute Resolution Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 24.1 | Navigate to booking | Booking details visible |
| 24.2 | Click "File Dispute" | Dispute form opens |
| 24.3 | Select category | Category highlighted |
| 24.4 | Click Continue | Step 2 shows title/description inputs |
| 24.5 | Enter title and description | Inputs accept text |
| 24.6 | Upload evidence | File attached |
| 24.7 | Click File Dispute | Success toast, dispute created |
| 24.8 | View dispute timeline | Messages and status visible |

---

## 25. Performance & SEO Audit Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 25.1 | Open browser DevTools | Performance tab available |
| 25.2 | Run Lighthouse audit | Score > 85 for all categories |
| 25.3 | Check Core Web Vitals | LCP < 4s, CLS < 0.25, FID < 300ms |
| 25.4 | Verify meta tags | Title, description, OG tags present |
| 25.5 | Check structured data | JSON-LD valid on worker profiles |
| 25.6 | Verify heading hierarchy | H1 > H2 > H3 sequential |
| 25.7 | Check image alt text | All images have descriptive alt |
| 25.8 | Test mobile responsiveness | Layout adapts to all viewports |

---

## 26. Analytics & CI/CD Testing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 26.1 | Visit site | Analytics consent banner appears |
| 26.2 | Click Accept | Analytics scripts load |
| 26.3 | Click Decline | No analytics loaded |
| 26.4 | Navigate pages | Page views tracked |
| 26.5 | Check CI workflow | GitHub Actions runs on push |
| 26.6 | Verify test results | 958+ tests pass |
| 26.7 | Check Lighthouse CI | Performance score > 70 |
| 26.8 | Verify deploy | Preview deploys on PR |

---

## Appendix C: Test Sign-Off

| Tester | Date | Areas Tested | Status |
|--------|------|--------------|--------|
| ______ | ______ | ______ | ☐ Pass |
| ______ | ______ | ______ | ☐ Pass |

---

**Document End**

*For questions about this testing document, contact the QA team.*
