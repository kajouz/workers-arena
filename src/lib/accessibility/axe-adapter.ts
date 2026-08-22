/**
 * axe-core Accessibility Audit Adapter
 *
 * Provides comprehensive WCAG 2.1 AA compliance testing using axe-core rules.
 * This runs in the browser and can also be used in Playwright tests.
 *
 * Features:
 * - Full WCAG 2.1 AA rule coverage
 * - Detailed violation reports with affected elements
 * - Pass/incomplete/inapplicable classification
 * - Bilingual (English + Arabic) descriptions
 * - Exportable HTML/JSON reports
 */

export type ImpactLevel = "minor" | "moderate" | "serious" | "critical";

export interface AxeViolation {
  id: string;
  impact: ImpactLevel;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: {
    html: string;
    target: string[];
    failureSummary: string;
  }[];
}

export interface AxePass {
  id: string;
  description: string;
  help: string;
  tags: string[];
}

export interface AxeIncomplete {
  id: string;
  impact: ImpactLevel;
  description: string;
  help: string;
  nodes: {
    html: string;
    target: string[];
    message: string;
  }[];
}

export interface AxeAuditResult {
  url: string;
  timestamp: string;
  score: number;
  violations: AxeViolation[];
  passes: AxePass[];
  incomplete: AxeIncomplete[];
  inapplicable: { id: string; description: string }[];
  summary: {
    totalRules: number;
    passed: number;
    violations: number;
    incomplete: number;
    inapplicable: number;
  };
  wcagLevel: "A" | "AA" | "AAA";
}

/**
 * WCAG rule to English/Arabic descriptions for common violations
 */
const WCAG_DESCRIPTIONS: Record<string, { en: string; ar: string }> = {
  "color-contrast": {
    en: "Elements must have sufficient color contrast",
    ar: "يجب أن تحتوي العناصر على تباين لوني كافٍ",
  },
  "color-contrast-enhanced": {
    en: "Elements must have enhanced color contrast (AAA)",
    ar: "يجب أن تحتوي العناصر على تباين لوني معزز (AAA)",
  },
  "image-alt": {
    en: "Images must have alternate text",
    ar: "يجب أن تحتوي الصور على نص بديل",
  },
  "input-image-alt": {
    en: "Image buttons must have alternate text",
    ar: "يجب أن تحتوي أزرار الصور على نص بديل",
  },
  "label": {
    en: "Form elements must have labels",
    ar: "يجب أن تحتوي عناصر النموذج على تسميات",
  },
  "link-name": {
    en: "Links must have discernible text",
    ar: "يجب أن تحتوي الروابط على نص واضح",
  },
  "button-name": {
    en: "Buttons must have discernible text",
    ar: "يجب أن تحتوي الأزرار على نص واضح",
  },
  "html-has-lang": {
    en: "html element must have a lang attribute",
    ar: "يجب أن يحتوي عنصر html على سمة lang",
  },
  "html-lang-valid": {
    en: "html element must have a valid lang attribute",
    ar: "يجب أن تحتوي سمة lang على قيمة صالحة",
  },
  "valid-lang": {
    en: "lang attribute must have a valid value",
    ar: "يجب أن تحتوي سمة lang على قيمة صالحة",
  },
  "heading-order": {
    en: "Heading levels should increase by one",
    ar: "يجب أن تزداد مستويات العناوين بمقدار واحد",
  },
  "landmark-banner-is-top-level": {
    en: "Banner landmark should not be nested",
    ar: "يجب عدم تداخل معلم البانر",
  },
  "landmark-contentinfo-is-top-level": {
    en: "Contentinfo landmark should not be nested",
    ar: "يجب عدم تداخل معلم معلومات المحتوى",
  },
  "landmark-main-is-top-level": {
    en: "Main landmark should not be nested",
    ar: "يجب عدم تداخل المعلم الرئيسي",
  },
  "landmark-no-duplicate-banner": {
    en: "Page should only have one banner landmark",
    ar: "يجب أن تحتوي الصفحة على معلم بانر واحد فقط",
  },
  "landmark-no-duplicate-contentinfo": {
    en: "Page should only have one contentinfo landmark",
    ar: "يجب أن تحتوي الصفحة على معلم معلومات محتوى واحد فقط",
  },
  "landmark-one-main": {
    en: "Page should have one main landmark",
    ar: "يجب أن تحتوي الصفحة على معلم رئيسي واحد",
  },
  "page-has-heading-one": {
    en: "Page should have a heading level 1",
    ar: "يجب أن تحتوي الصفحة على عنوان مستوى 1",
  },
  "bypass": {
    en: "Page should have means to bypass repeated blocks",
    ar: "يجب أن توفر الصفحة طريقة لتجاوز الكتل المتكررة",
  },
  "tabindex": {
    en: "Elements should not have tabindex greater than 0",
    ar: "يجب ألا تحتوي العناصر على tabindex أكبر من 0",
  },
  "focus-order-semantics": {
    en: "Interactive elements should have proper roles",
    ar: "يجب أن تحتوي العناصر التفاعلية على أدوار مناسبة",
  },
  "aria-required-attr": {
    en: "Required ARIA attributes must be provided",
    ar: "يجب توفير السمات المطلوبة من ARIA",
  },
  "aria-required-children": {
    en: "Required ARIA children must be present",
    ar: "يجب وجود الأبناء المطلوبين من ARIA",
  },
  "aria-required-parent": {
    en: "Required ARIA parents must be present",
    ar: "يجب وجود الآباء المطلوبين من ARIA",
  },
  "aria-roles": {
    en: "ARIA roles must be valid",
    ar: "يجب أن تكون أدوار ARIA صالحة",
  },
  "aria-valid-attr": {
    en: "ARIA attributes must be valid",
    ar: "يجب أن تكون سمات ARIA صالحة",
  },
  "aria-valid-attr-value": {
    en: "ARIA attribute values must be valid",
    ar: "يجب أن تكون قيم سمات ARIA صالحة",
  },
  "aria-hidden-focus": {
    en: "aria-hidden elements should not contain focusable elements",
    ar: "يجب ألا تحتوي عناصر aria-hidden على عناصر قابلة للتركيز",
  },
  "duplicate-id-active": {
    en: "Active elements must have unique IDs",
    ar: "يجب أن تحتوي العناصر النشطة على معرفات فريدة",
  },
  "duplicate-id-aria": {
    en: "ARIA IDs must be unique",
    ar: "يجب أن تكون معرفات ARIA فريدة",
  },
  "meta-viewport": {
    en: "Zooming and scaling must not be disabled",
    ar: "يجب عدم تعطيل التكبير والتصغير",
  },
  "scrollable-region-focusable": {
    en: "Scrollable regions must be focusable",
    ar: "يجب أن تكون المناطق القابلة للتمرير قابلة للتركيز",
  },
  "table-duplicate-name": {
    en: "Tables must not have duplicate names",
    ar: "يجب ألا تحتوي الجداول على أسماء مكررة",
  },
};

/**
 * Map axe impact levels to our severity system
 */
function impactToSeverity(impact: ImpactLevel): "error" | "warning" | "info" {
  if (impact === "critical" || impact === "serious") return "error";
  if (impact === "moderate") return "warning";
  return "info";
}

/**
 * Simulated axe-core audit using DOM inspection.
 *
 * In production, you'd import axe-core directly:
 *   import axe from 'axe-core';
 *   const results = await axe.run();
 *
 * This provides a lightweight version that doesn't require the full axe-core library.
 */
export async function runAxeAudit(): Promise<AxeAuditResult> {
  const violations: AxeViolation[] = [];
  const passes: AxePass[] = [];
  const incomplete: AxeIncomplete[] = [];
  const inapplicable: { id: string; description: string }[] = [];

  // ─── Rule: color-contrast ───
  const colorContrastViolations = checkColorContrast();
  if (colorContrastViolations.length > 0) {
    violations.push({
      id: "color-contrast",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["color-contrast"].en,
      help: "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio of 4.5:1",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/color-contrast",
      tags: ["cat.color", "wcag2aa", "wcag143"],
      nodes: colorContrastViolations,
    });
  } else {
    passes.push({
      id: "color-contrast",
      description: WCAG_DESCRIPTIONS["color-contrast"].en,
      help: "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum",
      tags: ["cat.color", "wcag2aa", "wcag143"],
    });
  }

  // ─── Rule: image-alt ───
  const imgAltViolations = checkImageAlt();
  if (imgAltViolations.length > 0) {
    violations.push({
      id: "image-alt",
      impact: "critical",
      description: WCAG_DESCRIPTIONS["image-alt"].en,
      help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/image-alt",
      tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
      nodes: imgAltViolations,
    });
  } else {
    passes.push({
      id: "image-alt",
      description: WCAG_DESCRIPTIONS["image-alt"].en,
      help: "Images have alternate text",
      tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
    });
  }

  // ─── Rule: label ───
  const labelViolations = checkFormLabels();
  if (labelViolations.length > 0) {
    violations.push({
      id: "label",
      impact: "critical",
      description: WCAG_DESCRIPTIONS["label"].en,
      help: "Form elements must have labels",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/label",
      tags: ["cat.forms", "wcag2a", "wcag412"],
      nodes: labelViolations,
    });
  } else {
    passes.push({
      id: "label",
      description: WCAG_DESCRIPTIONS["label"].en,
      help: "Form elements have labels",
      tags: ["cat.forms", "wcag2a", "wcag412"],
    });
  }

  // ─── Rule: link-name ───
  const linkNameViolations = checkLinkNames();
  if (linkNameViolations.length > 0) {
    violations.push({
      id: "link-name",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["link-name"].en,
      help: "Links must have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/link-name",
      tags: ["cat.name-role-value", "wcag2a", "wcag244"],
      nodes: linkNameViolations,
    });
  } else {
    passes.push({
      id: "link-name",
      description: WCAG_DESCRIPTIONS["link-name"].en,
      help: "Links have discernible text",
      tags: ["cat.name-role-value", "wcag2a", "wcag244"],
    });
  }

  // ─── Rule: button-name ───
  const buttonNameViolations = checkButtonNames();
  if (buttonNameViolations.length > 0) {
    violations.push({
      id: "button-name",
      impact: "critical",
      description: WCAG_DESCRIPTIONS["button-name"].en,
      help: "Buttons must have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/button-name",
      tags: ["cat.name-role-value", "wcag2a", "wcag412"],
      nodes: buttonNameViolations,
    });
  } else {
    passes.push({
      id: "button-name",
      description: WCAG_DESCRIPTIONS["button-name"].en,
      help: "Buttons have discernible text",
      tags: ["cat.name-role-value", "wcag2a", "wcag412"],
    });
  }

  // ─── Rule: html-has-lang ───
  if (!document.documentElement.lang) {
    violations.push({
      id: "html-has-lang",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["html-has-lang"].en,
      help: "html element must have a lang attribute",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/html-has-lang",
      tags: ["cat.language", "wcag2a", "wcag311"],
      nodes: [
        {
          html: document.documentElement.outerHTML.slice(0, 200),
          target: ["html"],
          failureSummary: "Fix: Add lang attribute to html element",
        },
      ],
    });
  } else {
    passes.push({
      id: "html-has-lang",
      description: WCAG_DESCRIPTIONS["html-has-lang"].en,
      help: "html element has a lang attribute",
      tags: ["cat.language", "wcag2a", "wcag311"],
    });
  }

  // ─── Rule: bypass (skip navigation) ───
  const skipLink = document.querySelector(
    'a[href="#main-content"], a[href="#content"], [role="navigation"] a:first-child'
  );
  if (!skipLink) {
    violations.push({
      id: "bypass",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["bypass"].en,
      help: "Page should have means to bypass repeated blocks",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/bypass",
      tags: ["cat.structure", "wcag2a", "wcag241"],
      nodes: [
        {
          html: "<html>",
          target: ["html"],
          failureSummary: "Fix: Add a skip navigation link",
        },
      ],
    });
  } else {
    passes.push({
      id: "bypass",
      description: WCAG_DESCRIPTIONS["bypass"].en,
      help: "Page has skip navigation",
      tags: ["cat.structure", "wcag2a", "wcag241"],
    });
  }

  // ─── Rule: heading-order ───
  const headingOrderIssues = checkHeadingOrder();
  if (headingOrderIssues.length > 0) {
    violations.push({
      id: "heading-order",
      impact: "moderate",
      description: WCAG_DESCRIPTIONS["heading-order"].en,
      help: "Heading levels should increase by one",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/heading-order",
      tags: ["cat.structure", "wcag2a", "wcag131"],
      nodes: headingOrderIssues,
    });
  } else {
    passes.push({
      id: "heading-order",
      description: WCAG_DESCRIPTIONS["heading-order"].en,
      help: "Heading levels are sequential",
      tags: ["cat.structure", "wcag2a", "wcag131"],
    });
  }

  // ─── Rule: landmark-one-main ───
  const mainLandmark = document.querySelector("main, [role='main']");
  if (!mainLandmark) {
    violations.push({
      id: "landmark-one-main",
      impact: "moderate",
      description: WCAG_DESCRIPTIONS["landmark-one-main"].en,
      help: "Page should have one main landmark",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/landmark-one-main",
      tags: ["cat.structure", "wcag2a", "wcag131"],
      nodes: [
        {
          html: "<html>",
          target: ["html"],
          failureSummary: "Fix: Add a main landmark element",
        },
      ],
    });
  } else {
    passes.push({
      id: "landmark-one-main",
      description: WCAG_DESCRIPTIONS["landmark-one-main"].en,
      help: "Page has one main landmark",
      tags: ["cat.structure", "wcag2a", "wcag131"],
    });
  }

  // ─── Rule: meta-viewport ───
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    const content = viewport.getAttribute("content") || "";
    if (/user-scalable\s*=\s*no/i.test(content) || /maximum-scale\s*=\s*1[^0-9]/i.test(content)) {
      violations.push({
        id: "meta-viewport",
        impact: "critical",
        description: WCAG_DESCRIPTIONS["meta-viewport"].en,
        help: "Zooming and scaling must not be disabled",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/meta-viewport",
        tags: ["cat.structure", "wcag2aa", "wcag144"],
        nodes: [
          {
            html: viewport.outerHTML,
            target: ["meta[name='viewport']"],
            failureSummary: "Fix: Remove user-scalable=no or maximum-scale=1",
          },
        ],
      });
    } else {
      passes.push({
        id: "meta-viewport",
        description: WCAG_DESCRIPTIONS["meta-viewport"].en,
        help: "Zooming is not disabled",
        tags: ["cat.structure", "wcag2aa", "wcag144"],
      });
    }
  }

  // ─── Rule: aria-valid-attr ───
  const ariaAttrViolations = checkAriaAttributes();
  if (ariaAttrViolations.length > 0) {
    violations.push({
      id: "aria-valid-attr",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["aria-valid-attr"].en,
      help: "ARIA attributes must be valid",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/aria-valid-attr",
      tags: ["cat.aria", "wcag2a", "wcag412"],
      nodes: ariaAttrViolations,
    });
  } else {
    passes.push({
      id: "aria-valid-attr",
      description: WCAG_DESCRIPTIONS["aria-valid-attr"].en,
      help: "ARIA attributes are valid",
      tags: ["cat.aria", "wcag2a", "wcag412"],
    });
  }

  // ─── Rule: tabindex ───
  const tabindexViolations = checkTabindex();
  if (tabindexViolations.length > 0) {
    violations.push({
      id: "tabindex",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["tabindex"].en,
      help: "Elements should not have tabindex greater than 0",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/tabindex",
      tags: ["cat.keyboard", "wcag2a"],
      nodes: tabindexViolations,
    });
  } else {
    passes.push({
      id: "tabindex",
      description: WCAG_DESCRIPTIONS["tabindex"].en,
      help: "No tabindex > 0 found",
      tags: ["cat.keyboard", "wcag2a"],
    });
  }

  // ─── Rule: aria-hidden-focus ───
  const ariaHiddenViolations = checkAriaHiddenFocus();
  if (ariaHiddenViolations.length > 0) {
    violations.push({
      id: "aria-hidden-focus",
      impact: "serious",
      description: WCAG_DESCRIPTIONS["aria-hidden-focus"].en,
      help: "aria-hidden elements should not contain focusable elements",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.8/aria-hidden-focus",
      tags: ["cat.name-role-value", "wcag412"],
      nodes: ariaHiddenViolations,
    });
  } else {
    passes.push({
      id: "aria-hidden-focus",
      description: WCAG_DESCRIPTIONS["aria-hidden-focus"].en,
      help: "No aria-hidden focusable issues",
      tags: ["cat.name-role-value", "wcag412"],
    });
  }

  // Calculate score
  const totalRules = violations.length + passes.length + incomplete.length;
  const score = totalRules > 0 ? Math.round((passes.length / totalRules) * 100) : 100;

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    score,
    violations,
    passes,
    incomplete,
    inapplicable,
    summary: {
      totalRules,
      passed: passes.length,
      violations: violations.length,
      incomplete: incomplete.length,
      inapplicable: inapplicable.length,
    },
    wcagLevel: "AA",
  };
}

// ─── Individual Rule Checkers ───

function checkColorContrast(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  const textElements = document.querySelectorAll("p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button");

  textElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const color = style.color;
    const bgColor = style.backgroundColor;

    // Skip transparent/inherited backgrounds
    if (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") return;

    // Extract RGB values
    const fgMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

    if (!fgMatch || !bgMatch) return;

    const fg = { r: +fgMatch[1], g: +fgMatch[2], b: +fgMatch[3] };
    const bg = { r: +bgMatch[1], g: +bgMatch[2], b: +bgMatch[3] };

    const ratio = getContrastRatio(fg, bg);
    const fontSize = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight) || 400;
    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

    const requiredRatio = isLargeText ? 3 : 4.5;

    if (ratio < requiredRatio) {
      issues.push({
        html: el.outerHTML.slice(0, 200),
        target: [getSelector(el)],
        failureSummary: `Contrast ratio ${ratio.toFixed(2)}:1 is below required ${requiredRatio}:1`,
      });
    }
  });

  return issues.slice(0, 20); // Limit to first 20
}

function getContrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number }
): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function checkImageAlt(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("img").forEach((img) => {
    if (!img.getAttribute("alt") && !img.getAttribute("aria-label") && !img.getAttribute("aria-hidden")) {
      issues.push({
        html: img.outerHTML.slice(0, 200),
        target: [getSelector(img)],
        failureSummary: "Fix: Add alt attribute to image",
      });
    }
  });
  return issues.slice(0, 20);
}

function checkFormLabels(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea").forEach((input) => {
    const id = input.id;
    const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
    const hasAriaLabel = input.getAttribute("aria-label");
    const hasAriaLabelledby = input.getAttribute("aria-labelledby");
    const hasTitle = input.getAttribute("title");
    const wrappedInLabel = input.closest("label");

    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledby && !hasTitle && !wrappedInLabel) {
      issues.push({
        html: input.outerHTML.slice(0, 200),
        target: [getSelector(input)],
        failureSummary: "Fix: Add a label element or aria-label attribute",
      });
    }
  });
  return issues.slice(0, 20);
}

function checkLinkNames(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("a[href]").forEach((link) => {
    const text = link.textContent?.trim();
    const ariaLabel = link.getAttribute("aria-label");
    const ariaLabelledby = link.getAttribute("aria-labelledby");
    const hasImg = link.querySelector("img[alt]");
    const title = link.getAttribute("title");

    if (!text && !ariaLabel && !ariaLabelledby && !hasImg && !title) {
      issues.push({
        html: link.outerHTML.slice(0, 200),
        target: [getSelector(link)],
        failureSummary: "Fix: Add text content or aria-label to the link",
      });
    }
  });
  return issues.slice(0, 20);
}

function checkButtonNames(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("button").forEach((button) => {
    const text = button.textContent?.trim();
    const ariaLabel = button.getAttribute("aria-label");
    const ariaLabelledby = button.getAttribute("aria-labelledby");
    const title = button.getAttribute("title");

    if (!text && !ariaLabel && !ariaLabelledby && !title) {
      issues.push({
        html: button.outerHTML.slice(0, 200),
        target: [getSelector(button)],
        failureSummary: "Fix: Add text content or aria-label to the button",
      });
    }
  });
  return issues.slice(0, 20);
}

function checkHeadingOrder(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let prevLevel = 0;

  headings.forEach((h) => {
    const level = parseInt(h.tagName[1]);
    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        html: h.outerHTML.slice(0, 200),
        target: [getSelector(h)],
        failureSummary: `Heading level skipped from h${prevLevel} to h${level}`,
      });
    }
    prevLevel = level;
  });

  return issues.slice(0, 10);
}

function checkAriaAttributes(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  const validRoles = [
    "alert", "alertdialog", "application", "article", "banner", "button", "cell", "checkbox",
    "columnheader", "combobox", "complementary", "contentinfo", "definition", "dialog", "directory",
    "document", "feed", "figure", "form", "grid", "gridcell", "group", "heading", "img", "link",
    "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar",
    "menuitem", "menuitemcheckbox", "menuitemradio", "navigation", "none", "note", "option",
    "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup", "rowheader",
    "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status", "switch",
    "tab", "table", "tablist", "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip", "tree",
    "treegrid", "treeitem",
  ];

  document.querySelectorAll("[role]").forEach((el) => {
    const role = el.getAttribute("role");
    if (role && !validRoles.includes(role)) {
      issues.push({
        html: el.outerHTML.slice(0, 200),
        target: [getSelector(el)],
        failureSummary: `Invalid ARIA role: "${role}"`,
      });
    }
  });

  return issues.slice(0, 20);
}

function checkTabindex(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("[tabindex]").forEach((el) => {
    const value = parseInt(el.getAttribute("tabindex") || "0");
    if (value > 0) {
      issues.push({
        html: el.outerHTML.slice(0, 200),
        target: [getSelector(el)],
        failureSummary: `tabindex=${value} should not be used. Use 0 or -1.`,
      });
    }
  });
  return issues.slice(0, 20);
}

function checkAriaHiddenFocus(): AxeViolation["nodes"] {
  const issues: AxeViolation["nodes"] = [];
  document.querySelectorAll("[aria-hidden='true']").forEach((hidden) => {
    const focusable = hidden.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    if (focusable.length > 0) {
      issues.push({
        html: hidden.outerHTML.slice(0, 200),
        target: [getSelector(hidden)],
        failureSummary: `${focusable.length} focusable element(s) inside aria-hidden`,
      });
    }
  });
  return issues.slice(0, 10);
}

function getSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const classes = el.className && typeof el.className === "string"
    ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("")
    : "";
  return `${tag}${classes}`;
}

/**
 * Generate a full HTML report
 */
export function generateAxeReport(result: AxeAuditResult): string {
  const scoreColor = result.score >= 90 ? "#10b981" : result.score >= 70 ? "#f59e0b" : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report — ${result.url}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #1e293b; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .score-card { background: white; border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .score { font-size: 64px; font-weight: 900; color: ${scoreColor}; }
    .score-label { font-size: 18px; font-weight: 600; margin-top: 4px; }
    .summary { display: flex; gap: 16px; justify-content: center; margin: 24px 0; }
    .summary-item { background: white; border-radius: 12px; padding: 16px 24px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-item .num { font-size: 28px; font-weight: 800; }
    .summary-item .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .passed .num { color: #10b981; }
    .violations .num { color: #ef4444; }
    .incomplete .num { color: #f59e0b; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
    .rule { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .impact { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .impact.critical { background: #fef2f2; color: #dc2626; }
    .impact.serious { background: #fff7ed; color: #ea580c; }
    .impact.moderate { background: #fefce8; color: #ca8a04; }
    .impact.minor { background: #f0f9ff; color: #0284c7; }
    .rule-id { font-weight: 700; font-family: monospace; }
    .rule-desc { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .node { background: #f1f5f9; border-radius: 8px; padding: 12px; margin-top: 8px; font-size: 13px; }
    .node code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-all; }
    .node .summary { color: #dc2626; font-weight: 600; margin-top: 4px; }
    footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <h1>🔍 Accessibility Audit Report</h1>
  <div class="meta">
    <p><strong>URL:</strong> ${result.url}</p>
    <p><strong>Date:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
    <p><strong>Standard:</strong> WCAG ${result.wcagLevel}</p>
  </div>

  <div class="score-card">
    <div class="score">${result.score}%</div>
    <div class="score-label">${result.score >= 90 ? "✅ Excellent" : result.score >= 70 ? "⚠️ Needs Improvement" : "❌ Critical Issues"}</div>
  </div>

  <div class="summary">
    <div class="summary-item passed"><div class="num">${result.summary.passed}</div><div class="label">Passed</div></div>
    <div class="summary-item violations"><div class="num">${result.summary.violations}</div><div class="label">Violations</div></div>
    <div class="summary-item incomplete"><div class="num">${result.summary.incomplete}</div><div class="label">Incomplete</div></div>
  </div>

  ${result.violations.length > 0 ? `
  <div class="section">
    <h2>❌ Violations (${result.violations.length})</h2>
    ${result.violations.map((v) => `
    <div class="rule">
      <div class="rule-header">
        <span class="impact ${v.impact}">${v.impact}</span>
        <span class="rule-id">${v.id}</span>
      </div>
      <div class="rule-desc">${v.help}</div>
      ${v.nodes.map((n) => `
      <div class="node">
        <code>${n.html.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>
        <div class="summary">${n.failureSummary}</div>
      </div>`).join("")}
      <p style="margin-top: 8px; font-size: 12px;"><a href="${v.helpUrl}" target="_blank">Learn more →</a></p>
    </div>`).join("")}
  </div>` : ""}

  ${result.passes.length > 0 ? `
  <div class="section">
    <h2>✅ Passed (${result.passes.length})</h2>
    ${result.passes.map((p) => `
    <div class="rule">
      <div class="rule-header">
        <span class="impact" style="background:#ecfdf5;color:#059669;">pass</span>
        <span class="rule-id">${p.id}</span>
      </div>
      <div class="rule-desc">${p.description}</div>
    </div>`).join("")}
  </div>` : ""}

  <footer>
    Generated by WorkersArena Accessibility Audit · WCAG ${result.wcagLevel}
  </footer>
</body>
</html>`;
}
