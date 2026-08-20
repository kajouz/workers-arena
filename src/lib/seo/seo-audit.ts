/**
 * SEO Audit Utility
 * Client-side SEO checks and recommendations.
 */

/* ─── Types ─── */
export interface SEOCheck {
  name: string;
  category: "meta" | "structure" | "content" | "technical" | "accessibility";
  status: "pass" | "warning" | "fail";
  score: number; // 0-100
  description: string;
  fix?: string;
}

export interface SEOAuditResult {
  score: number;
  checks: SEOCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
  timestamp: string;
}

/* ─── Meta Tag Checks ─── */
function checkMetaTags(): SEOCheck[] {
  const checks: SEOCheck[] = [];

  // Title
  const title = document.title;
  if (title && title.length > 0) {
    checks.push({
      name: "Page title exists",
      category: "meta",
      status: title.length >= 30 && title.length <= 60 ? "pass" : "warning",
      score: title.length >= 30 && title.length <= 60 ? 100 : 50,
      description: `Title is ${title.length} characters (recommended: 30-60)`,
      fix: title.length < 30 ? "Add a more descriptive title" : "Shorten the title to under 60 characters",
    });
  } else {
    checks.push({
      name: "Page title exists",
      category: "meta",
      status: "fail",
      score: 0,
      description: "No page title found",
      fix: "Add a descriptive <title> tag",
    });
  }

  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  const desc = metaDesc?.getAttribute("content") ?? "";
  if (desc) {
    checks.push({
      name: "Meta description exists",
      category: "meta",
      status: desc.length >= 120 && desc.length <= 160 ? "pass" : "warning",
      score: desc.length >= 120 && desc.length <= 160 ? 100 : 50,
      description: `Description is ${desc.length} characters (recommended: 120-160)`,
    });
  } else {
    checks.push({
      name: "Meta description exists",
      category: "meta",
      status: "fail",
      score: 0,
      description: "No meta description found",
      fix: "Add a meta description tag",
    });
  }

  // Canonical
  const canonical = document.querySelector('link[rel="canonical"]');
  checks.push({
    name: "Canonical URL set",
    category: "meta",
    status: canonical ? "pass" : "warning",
    score: canonical ? 100 : 50,
    description: canonical
      ? `Canonical: ${canonical.getAttribute("href")}`
      : "No canonical URL found",
    fix: !canonical ? "Add a canonical link tag" : undefined,
  });

  // Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const ogScore = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    name: "Open Graph tags",
    category: "meta",
    status: ogScore === 3 ? "pass" : ogScore > 0 ? "warning" : "fail",
    score: Math.round((ogScore / 3) * 100),
    description: `${ogScore}/3 Open Graph tags present (title, description, image)`,
    fix: ogScore < 3 ? "Add missing Open Graph tags for social sharing" : undefined,
  });

  // Twitter Card
  const twitterCard = document.querySelector('meta[name="twitter:card"]');
  checks.push({
    name: "Twitter Card meta",
    category: "meta",
    status: twitterCard ? "pass" : "warning",
    score: twitterCard ? 100 : 50,
    description: twitterCard
      ? `Twitter card type: ${twitterCard.getAttribute("content")}`
      : "No Twitter Card meta tag found",
  });

  // Viewport
  const viewport = document.querySelector('meta[name="viewport"]');
  checks.push({
    name: "Viewport meta tag",
    category: "technical",
    status: viewport ? "pass" : "fail",
    score: viewport ? 100 : 0,
    description: viewport
      ? "Viewport meta tag is set for responsive design"
      : "No viewport meta tag found",
    fix: !viewport ? 'Add <meta name="viewport" content="width=device-width, initial-scale=1">' : undefined,
  });

  return checks;
}

/* ─── Structure Checks ─── */
function checkStructure(): SEOCheck[] {
  const checks: SEOCheck[] = [];

  // Headings hierarchy
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const h1Count = headings.filter((h) => h.tagName === "H1").length;

  checks.push({
    name: "H1 tag present",
    category: "structure",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warning",
    score: h1Count === 1 ? 100 : h1Count === 0 ? 0 : 60,
    description: `Found ${h1Count} H1 tag(s)`,
    fix: h1Count === 0 ? "Add exactly one H1 tag per page" : h1Count > 1 ? "Use only one H1 tag" : undefined,
  });

  // Heading hierarchy
  let hierarchyBroken = false;
  for (let i = 1; i < headings.length; i++) {
    const prev = parseInt(headings[i - 1].tagName.replace("H", ""));
    const curr = parseInt(headings[i].tagName.replace("H", ""));
    if (curr > prev + 1) {
      hierarchyBroken = true;
      break;
    }
  }
  checks.push({
    name: "Heading hierarchy",
    category: "structure",
    status: hierarchyBroken ? "warning" : "pass",
    score: hierarchyBroken ? 60 : 100,
    description: hierarchyBroken
      ? "Heading levels are not sequential (e.g., H1 → H3 skipping H2)"
      : "Heading hierarchy is sequential",
    fix: hierarchyBroken ? "Use heading levels in order (H1 → H2 → H3)" : undefined,
  });

  // Structured data (JSON-LD)
  const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
  checks.push({
    name: "Structured data (JSON-LD)",
    category: "structure",
    status: jsonLd.length > 0 ? "pass" : "warning",
    score: jsonLd.length > 0 ? 100 : 30,
    description: `Found ${jsonLd.length} JSON-LD script(s)`,
    fix: jsonLd.length === 0 ? "Add structured data for Organization, LocalBusiness, or Product" : undefined,
  });

  // Navigation
  const nav = document.querySelector("nav");
  checks.push({
    name: "Navigation landmark",
    category: "structure",
    status: nav ? "pass" : "warning",
    score: nav ? 100 : 50,
    description: nav ? "Nav element found" : "No nav landmark element found",
  });

  return checks;
}

/* ─── Content Checks ─── */
function checkContent(): SEOCheck[] {
  const checks: SEOCheck[] = [];

  // Images with alt text
  const images = Array.from(document.querySelectorAll("img"));
  const withAlt = images.filter((img) => img.alt && img.alt.trim().length > 0).length;
  const altScore = images.length > 0 ? Math.round((withAlt / images.length) * 100) : 100;
  checks.push({
    name: "Image alt text",
    category: "content",
    status: altScore === 100 ? "pass" : altScore >= 70 ? "warning" : "fail",
    score: altScore,
    description: `${withAlt}/${images.length} images have alt text`,
    fix: altScore < 100 ? "Add descriptive alt text to all images" : undefined,
  });

  // Links
  const links = Array.from(document.querySelectorAll("a[href]"));
  const externalLinks = links.filter(
    (l) => (l as HTMLAnchorElement).hostname !== window.location.hostname
  );
  const nofollow = externalLinks.filter(
    (l) => l.getAttribute("rel")?.includes("nofollow")
  );
  checks.push({
    name: "External links",
    category: "content",
    status: "pass",
    score: 100,
    description: `${links.length} total links, ${externalLinks.length} external, ${nofollow.length} nofollow`,
  });

  // Word count
  const bodyText = document.body?.innerText ?? "";
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  checks.push({
    name: "Content length",
    category: "content",
    status: wordCount >= 300 ? "pass" : wordCount >= 100 ? "warning" : "fail",
    score: wordCount >= 300 ? 100 : wordCount >= 100 ? 60 : 20,
    description: `~${wordCount} words on page`,
    fix: wordCount < 300 ? "Add more descriptive content for SEO" : undefined,
  });

  return checks;
}

/* ─── Technical Checks ─── */
function checkTechnical(): SEOCheck[] {
  const checks: SEOCheck[] = [];

  // HTTPS
  checks.push({
    name: "HTTPS",
    category: "technical",
    status: location.protocol === "https:" ? "pass" : "fail",
    score: location.protocol === "https:" ? 100 : 0,
    description: `Protocol: ${location.protocol}`,
    fix: location.protocol !== "https:" ? "Enable HTTPS" : undefined,
  });

  // Lang attribute
  const lang = document.documentElement.lang;
  checks.push({
    name: "HTML lang attribute",
    category: "technical",
    status: lang ? "pass" : "fail",
    score: lang ? 100 : 0,
    description: lang ? `Language: ${lang}` : "No lang attribute on <html>",
    fix: !lang ? 'Add lang attribute to <html> tag' : undefined,
  });

  // Robots meta
  const robots = document.querySelector('meta[name="robots"]');
  checks.push({
    name: "Robots meta tag",
    category: "technical",
    status: "pass",
    score: 100,
    description: robots
      ? `Robots: ${robots.getAttribute("content")}`
      : "No robots meta (defaults to index, follow)",
  });

  // Preconnect
  const preconnect = document.querySelectorAll('link[rel="preconnect"]');
  checks.push({
    name: "Preconnect hints",
    category: "technical",
    status: preconnect.length > 0 ? "pass" : "warning",
    score: preconnect.length > 0 ? 100 : 50,
    description: `${preconnect.length} preconnect hint(s)`,
    fix: preconnect.length === 0 ? "Add preconnect for critical third-party origins" : undefined,
  });

  return checks;
}

/* ─── Accessibility Checks ─── */
function checkAccessibility(): SEOCheck[] {
  const checks: SEOCheck[] = [];

  // Skip nav
  const skipNav = document.querySelector('a[href="#main-content"], a[href="#content"]');
  checks.push({
    name: "Skip navigation link",
    category: "accessibility",
    status: skipNav ? "pass" : "warning",
    score: skipNav ? 100 : 40,
    description: skipNav ? "Skip nav link found" : "No skip navigation link",
    fix: !skipNav ? "Add a skip-to-content link for keyboard users" : undefined,
  });

  // Main landmark
  const main = document.querySelector("main");
  checks.push({
    name: "Main landmark",
    category: "accessibility",
    status: main ? "pass" : "fail",
    score: main ? 100 : 0,
    description: main ? "<main> element found" : "No <main> landmark",
    fix: !main ? "Wrap main content in a <main> element" : undefined,
  });

  // ARIA labels on interactive elements
  const buttons = Array.from(document.querySelectorAll("button"));
  const withLabel = buttons.filter(
    (b) =>
      b.textContent?.trim() ||
      b.getAttribute("aria-label") ||
      b.getAttribute("aria-labelledby")
  ).length;
  const btnScore = buttons.length > 0 ? Math.round((withLabel / buttons.length) * 100) : 100;
  checks.push({
    name: "Button labels",
    category: "accessibility",
    status: btnScore >= 90 ? "pass" : btnScore >= 60 ? "warning" : "fail",
    score: btnScore,
    description: `${withLabel}/${buttons.length} buttons have accessible labels`,
    fix: btnScore < 90 ? "Add aria-label or visible text to all buttons" : undefined,
  });

  return checks;
}

/* ─── Full SEO Audit ─── */
export function runSEOAudit(): SEOAuditResult {
  const checks = [
    ...checkMetaTags(),
    ...checkStructure(),
    ...checkContent(),
    ...checkTechnical(),
    ...checkAccessibility(),
  ];

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    score: Math.round(totalScore),
    checks,
    summary: { passed, warnings, failed },
    timestamp: new Date().toISOString(),
  };
}
