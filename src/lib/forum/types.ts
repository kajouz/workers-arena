/**
 * Type definitions for worker Q&A and forum features.
 */

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: "worker" | "customer" | "admin";
  category: ForumCategory;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  views: number;
  upvotes: number;
  downvotes: number;
  answerCount: number;
  isPinned: boolean;
  isLocked: boolean;
}

export interface ForumAnswer {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: "worker" | "customer" | "admin";
  createdAt: Date;
  updatedAt: Date;
  upvotes: number;
  downvotes: number;
  isAccepted: boolean;
}

export type ForumCategory =
  | "general"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "cleaning"
  | "painting"
  | "carpentry"
  | "tiling"
  | "business"
  | "safety"
  | "tools"
  | "tips";

export const FORUM_CATEGORIES: Record<ForumCategory, { nameEn: string; nameAr: string; icon: string }> = {
  general: { nameEn: "General", nameAr: "عام", icon: "💬" },
  plumbing: { nameEn: "Plumbing", nameAr: "سباكة", icon: "🔧" },
  electrical: { nameEn: "Electrical", nameAr: "كهرباء", icon: "⚡" },
  hvac: { nameEn: "HVAC", nameAr: "تكييف", icon: "❄️" },
  cleaning: { nameEn: "Cleaning", nameAr: "تنظيف", icon: "🧹" },
  painting: { nameEn: "Painting", nameAr: "دهان", icon: "🎨" },
  carpentry: { nameEn: "Carpentry", nameAr: "نجارة", icon: "🪚" },
  tiling: { nameEn: "Tiling", nameAr: "بلاط", icon: "🧱" },
  business: { nameEn: "Business", nameAr: "أعمال", icon: "💼" },
  safety: { nameEn: "Safety", nameAr: "سلامة", icon: "🦺" },
  tools: { nameEn: "Tools", nameAr: "أدوات", icon: "🔨" },
  tips: { nameEn: "Tips & Tricks", nameAr: "نصائح وحيل", icon: "💡" },
};

export interface ForumVote {
  id: string;
  userId: string;
  targetType: "post" | "answer";
  targetId: string;
  value: 1 | -1;
  createdAt: Date;
}

export interface ForumComment {
  id: string;
  targetType: "post" | "answer";
  targetId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}
