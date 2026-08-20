/**
 * AI Review Moderation
 * Detects spam, fake reviews, inappropriate content, and analyzes sentiment.
 * 
 * In production, integrate with OpenAI/Anthropic for LLM-based detection.
 * For now, uses pattern matching and heuristic rules.
 */

/* ─── Types ─── */
export type ModerationFlag =
  | "spam"
  | "fake_positive"
  | "fake_negative"
  | "inappropriate"
  | "off_topic"
  | "self_promotion"
  | "personal_attack"
  | "low_quality";

export interface ModerationResult {
  approved: boolean;
  flags: ModerationFlag[];
  confidence: number; // 0-1
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // -1 to 1
  reasons: string[];
  suggestedAction: "approve" | "review" | "reject";
}

export interface ReviewInput {
  text: string;
  rating: number; // 1-5
  workerId: string;
  customerId: string;
  bookingId?: string;
}

/* ─── Spam Patterns ─── */
const SPAM_PATTERNS = [
  /\b(buy|sell|click|visit|www\.|http|\.com|\.net|\.org|free money|casino|viagra|discount code)\b/i,
  /(.)\1{5,}/, // Repeated characters
  /[A-Z\s]{20,}/, // All caps long text
  /\b(telegram|whatsapp|call me|contact me|dm me)\b/i,
  /(fake|scam|fraud)\b.*\b(fake|scam|fraud)\b/i,
];

const SELF_PROMOTION_PATTERNS = [
  /\b(my (business|company|service|website))\b/i,
  /\b(hire me|hire us|choose me)\b/i,
  /\b(cheaper than|better than|best in)\b/i,
];

const PERSONAL_ATTACK_PATTERNS = [
  /\b(idiot|stupid|dumb|moron|loser|trash|garbage|useless)\b/i,
  /\b(hate|despise|loathing)\b/i,
];

const GENERIC_PHRASES = [
  "great service",
  "highly recommend",
  "best worker",
  "amazing job",
  "excellent work",
  "very professional",
  "on time",
  "great price",
  "would recommend",
  "five stars",
];

/* ─── Sentiment Analysis (simple lexicon-based) ─── */
const POSITIVE_WORDS = [
  "great", "excellent", "amazing", "wonderful", "fantastic", "perfect",
  "professional", "reliable", "trustworthy", "fast", "efficient", "clean",
  "friendly", "helpful", "punctual", "skilled", "expert", "recommend",
  "satisfied", "happy", "pleased", "impressed", "outstanding", "superb",
  "ممتاز", "رائع", "مبدع", "محترف", "موثوق", "سريع",
];

const NEGATIVE_WORDS = [
  "terrible", "awful", "horrible", "worst", "bad", "poor", "slow",
  "late", "rude", "unprofessional", "broken", "damaged", "dirty",
  "overcharged", "scam", "fraud", "waste", "disappointed", "angry",
  "سيء", "فظيع", "بطيء", "متأخر", "غير محترف", "مخيب",
];

function analyzeSentiment(text: string): { sentiment: "positive" | "neutral" | "negative"; score: number } {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of words) {
    if (POSITIVE_WORDS.some((pw) => word.includes(pw))) positiveCount++;
    if (NEGATIVE_WORDS.some((nw) => word.includes(nw))) negativeCount++;
  }
  
  const total = positiveCount + negativeCount;
  if (total === 0) return { sentiment: "neutral", score: 0 };
  
  const score = (positiveCount - negativeCount) / total;
  
  if (score > 0.2) return { sentiment: "positive", score };
  if (score < -0.2) return { sentiment: "negative", score };
  return { sentiment: "neutral", score };
}

/* ─── Main Moderation Function ─── */
export function moderateReview(review: ReviewInput): ModerationResult {
  const { text, rating } = review;
  const flags: ModerationFlag[] = [];
  const reasons: string[] = [];
  
  // 1. Spam detection
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("spam");
      reasons.push("Contains spam-like content");
      break;
    }
  }
  
  // 2. Self-promotion detection
  for (const pattern of SELF_PROMOTION_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("self_promotion");
      reasons.push("Contains self-promotional content");
      break;
    }
  }
  
  // 3. Personal attack detection
  for (const pattern of PERSONAL_ATTACK_PATTERNS) {
    if (pattern.test(text)) {
      flags.push("personal_attack");
      reasons.push("Contains personal attacks or offensive language");
      break;
    }
  }
  
  // 4. Fake review detection
  const lower = text.toLowerCase();
  const isGeneric = GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
  const isTooShort = text.split(/\s+/).length < 5;
  const isRatingExtreme = rating === 1 || rating === 5;
  const hasNoDetails = !lower.includes("because") && !lower.includes("since") && !lower.includes("due to");
  
  if (isGeneric && isTooShort) {
    flags.push("fake_positive");
    reasons.push("Review appears generic and lacks specific details");
  }
  
  if (isRatingExtreme && isTooShort && hasNoDetails) {
    flags.push(isRatingExtreme && rating === 5 ? "fake_positive" : "fake_negative");
    reasons.push("Extreme rating without supporting details");
  }
  
  // 5. Inappropriate content detection
  const inappropriateWords = /\b(bad word patterns)\b/i; // Placeholder
  if (inappropriateWords.test(text)) {
    flags.push("inappropriate");
    reasons.push("Contains inappropriate content");
  }
  
  // 6. Low quality detection
  if (text.length < 20) {
    flags.push("low_quality");
    reasons.push("Review is too short to be helpful");
  }
  
  // 7. Off-topic detection
  if (text.length > 100 && !lower.includes("worker") && !lower.includes("service") && !lower.includes("job")) {
    flags.push("off_topic");
    reasons.push("Review may be off-topic");
  }
  
  // Sentiment analysis
  const sentimentResult = analyzeSentiment(text);
  
  // Sentiment-rating mismatch
  if (sentimentResult.sentiment === "positive" && rating <= 2) {
    flags.push("fake_positive");
    reasons.push("Positive sentiment doesn't match low rating");
  }
  if (sentimentResult.sentiment === "negative" && rating >= 4) {
    flags.push("fake_negative");
    reasons.push("Negative sentiment doesn't match high rating");
  }
  
  // Calculate confidence
  const confidence = Math.min(1, flags.length * 0.25);
  
  // Determine action
  let suggestedAction: "approve" | "review" | "reject" = "approve";
  if (flags.includes("spam") || flags.includes("personal_attack")) {
    suggestedAction = "reject";
  } else if (flags.length >= 2) {
    suggestedAction = "review";
  } else if (flags.length === 1) {
    suggestedAction = "review";
  }
  
  return {
    approved: suggestedAction === "approve",
    flags,
    confidence,
    sentiment: sentimentResult.sentiment,
    sentimentScore: sentimentResult.score,
    reasons,
    suggestedAction,
  };
}

/* ─── Batch Moderation ─── */
export function moderateReviews(reviews: ReviewInput[]): {
  approved: ReviewInput[];
  flagged: (ReviewInput & { moderation: ModerationResult })[];
  rejected: (ReviewInput & { moderation: ModerationResult })[];
} {
  const approved: ReviewInput[] = [];
  const flagged: (ReviewInput & { moderation: ModerationResult })[] = [];
  const rejected: (ReviewInput & { moderation: ModerationResult })[] = [];
  
  for (const review of reviews) {
    const result = moderateReview(review);
    
    if (result.suggestedAction === "approve") {
      approved.push(review);
    } else if (result.suggestedAction === "review") {
      flagged.push({ ...review, moderation: result });
    } else {
      rejected.push({ ...review, moderation: result });
    }
  }
  
  return { approved, flagged, rejected };
}

/* ─── Stats ─── */
export function getModerationStats(results: ModerationResult[]): {
  total: number;
  approved: number;
  flagged: number;
  rejected: number;
  flagCounts: Record<ModerationFlag, number>;
} {
  const flagCounts: Record<ModerationFlag, number> = {
    spam: 0,
    fake_positive: 0,
    fake_negative: 0,
    inappropriate: 0,
    off_topic: 0,
    self_promotion: 0,
    personal_attack: 0,
    low_quality: 0,
  };
  
  let approved = 0;
  let flagged = 0;
  let rejected = 0;
  
  for (const result of results) {
    if (result.suggestedAction === "approve") approved++;
    else if (result.suggestedAction === "review") flagged++;
    else rejected++;
    
    for (const flag of result.flags) {
      flagCounts[flag]++;
    }
  }
  
  return {
    total: results.length,
    approved,
    flagged,
    rejected,
    flagCounts,
  };
}
