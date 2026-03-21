/**
 * Accessibility preference management for RPwD Act 2016 compliance.
 * Manages high contrast, large font, screen reader, and color-blind safe modes.
 */

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeFont: boolean;
  screenReaderOptimized: boolean;
  colorBlindSafe: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = "ps_accessibility_prefs";

const DEFAULT_PREFS: AccessibilityPreferences = {
  highContrast: false,
  largeFont: false,
  screenReaderOptimized: false,
  colorBlindSafe: false,
  reducedMotion: false,
};

export function loadAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    }
  } catch {
    // corrupted storage
  }

  // Auto-detect OS preferences
  const prefs = { ...DEFAULT_PREFS };
  if (window.matchMedia("(prefers-contrast: more)").matches) {
    prefs.highContrast = true;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    prefs.reducedMotion = true;
  }

  return prefs;
}

export function saveAccessibilityPreferences(prefs: AccessibilityPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage full or unavailable
  }
}

export function applyAccessibilityPreferences(prefs: AccessibilityPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // High contrast mode
  root.classList.toggle("high-contrast", prefs.highContrast);

  // Large font mode (1.5x base)
  root.classList.toggle("large-font", prefs.largeFont);

  // Color-blind safe mode (patterns + shapes in addition to colors)
  root.classList.toggle("color-blind-safe", prefs.colorBlindSafe);

  // Reduced motion
  root.classList.toggle("reduced-motion", prefs.reducedMotion);

  // Screen reader optimizations
  root.classList.toggle("sr-optimized", prefs.screenReaderOptimized);

  // Set font size scale via CSS custom property
  root.style.setProperty("--font-scale", prefs.largeFont ? "1.5" : "1");
}

/**
 * Announce a message to screen readers via an ARIA live region.
 */
export function announceToScreenReader(message: string, priority: "polite" | "assertive" = "polite"): void {
  if (typeof document === "undefined") return;

  let region = document.getElementById(`sr-announce-${priority}`);
  if (!region) {
    region = document.createElement("div");
    region.id = `sr-announce-${priority}`;
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", priority);
    region.setAttribute("aria-atomic", "true");
    region.className = "sr-only";
    document.body.appendChild(region);
  }

  // Clear then set to trigger announcement
  region.textContent = "";
  requestAnimationFrame(() => {
    region!.textContent = message;
  });
}
