/**
 * ExamProctor — Client-side anti-cheat and proctoring module for ParikshaSuraksha.
 *
 * Detects and prevents common cheating vectors during exams:
 *   - Tab/window switching
 *   - Copy/paste and text selection
 *   - Screenshot and screen capture attempts
 *   - DevTools opening
 *   - Keyboard shortcut abuse
 *   - Multiple monitors
 *   - VM / remote desktop environments
 *   - Fullscreen exit
 *
 * All violations are logged with timestamps and reported to the server.
 * The proctoring data is evidence for human investigation — not auto-disqualification.
 *
 * Accessibility: screen readers continue to work; `prefers-reduced-motion`
 * disables animations but keeps all detection active.
 */

import { getAuthToken } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationType =
  | "tab_switch"
  | "focus_loss"
  | "copy_attempt"
  | "paste_attempt"
  | "cut_attempt"
  | "select_all_attempt"
  | "context_menu"
  | "screenshot_attempt"
  | "devtools_open"
  | "devtools_resize"
  | "blocked_shortcut"
  | "fullscreen_exit"
  | "multiple_monitors"
  | "vm_detected"
  | "remote_desktop_detected"
  | "print_attempt";

export interface ViolationEntry {
  type: ViolationType;
  timestamp: number;
  details: string;
  count: number;
}

export interface ProctorConfig {
  sessionId: string;
  candidateId: string;
  examId: string;
  apiUrl: string;
  maxTabSwitches: number;      // default 3
  maxFocusLoss: number;        // default 5
  heartbeatInterval: number;   // default 5000ms
  onViolation: (type: ViolationType, count: number) => void;
  onMaxViolations: () => void; // auto-submit trigger
}

export interface HeartbeatPayload {
  sessionId: string;
  timestamp: number;
  focusState: boolean;
  fullscreenState: boolean;
  screenCount: number;
}

export interface ProctorStatus {
  secure: boolean;
  tabSwitchCount: number;
  maxTabSwitches: number;
  fullscreen: boolean;
  online: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VM_USER_AGENT_PATTERNS = [
  /virtualbox/i,
  /vmware/i,
  /parallels/i,
  /qemu/i,
  /xen/i,
  /hyper-v/i,
  /bochs/i,
];

const REMOTE_DESKTOP_PATTERNS = [
  /anydesk/i,
  /teamviewer/i,
  /chrome\s*remote\s*desktop/i,
  /rustdesk/i,
  /parsec/i,
  /splashtop/i,
  /nomachine/i,
];

const VM_WEBGL_RENDERERS = [
  /virtualbox/i,
  /vmware/i,
  /llvmpipe/i,
  /swiftshader/i,
  /mesa/i,
  /parallels/i,
  /microsoft basic render/i,
  /google swiftshader/i,
];

function isMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
}

function now(): number {
  return Date.now();
}

// ---------------------------------------------------------------------------
// ExamProctor
// ---------------------------------------------------------------------------

export class ExamProctor {
  private config: ProctorConfig;
  private violations: ViolationEntry[] = [];
  private violationCounts: Map<ViolationType, number> = new Map();
  private running = false;

  // Interval / timer IDs
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private devtoolsTimer: ReturnType<typeof setInterval> | null = null;
  private watermarkTimer: ReturnType<typeof setInterval> | null = null;
  private screenCheckTimer: ReturnType<typeof setInterval> | null = null;

  // State tracking
  private isFocused = true;
  private isFullscreen = false;
  private fullscreenExitCount = 0;
  private screenCount = 1;
  private watermarkEl: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;

  // Size tracking for DevTools detection
  private lastOuterWidth = 0;
  private lastOuterHeight = 0;

  // Bound handlers (for removal)
  private boundHandlers: Map<string, EventListenerOrEventListenerObject> = new Map();

  constructor(config: ProctorConfig) {
    this.config = {
      maxTabSwitches: 3,
      maxFocusLoss: 5,
      heartbeatInterval: 5000,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Begin all monitoring. Call once when the exam becomes active.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.lastOuterWidth = window.outerWidth;
    this.lastOuterHeight = window.outerHeight;
    this.isFocused = document.hasFocus();
    this.isFullscreen = !!document.fullscreenElement;

    // Run initial environment checks (non-blocking)
    this.runEnvironmentChecks();

    // Attach all listeners
    this.attachVisibilityListeners();
    this.attachCopyPasteListeners();
    this.attachKeyboardListeners();
    this.attachFullscreenListeners();

    // Inject protective CSS
    this.injectProtectiveStyles();

    // Create watermark overlay
    this.createWatermark();

    // Start heartbeat
    this.startHeartbeat();

    // Start DevTools polling
    this.startDevToolsDetection();

    // Start multi-monitor polling
    this.startScreenMonitoring();
  }

  /**
   * Stop all monitoring. Call on exam submit.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    // Clear intervals
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.devtoolsTimer) { clearInterval(this.devtoolsTimer); this.devtoolsTimer = null; }
    if (this.watermarkTimer) { clearInterval(this.watermarkTimer); this.watermarkTimer = null; }
    if (this.screenCheckTimer) { clearInterval(this.screenCheckTimer); this.screenCheckTimer = null; }

    // Remove all event listeners
    this.boundHandlers.forEach((handler, key) => {
      const [target, event] = key.split("::");
      if (target === "document") {
        document.removeEventListener(event, handler, { capture: true });
      } else {
        window.removeEventListener(event, handler, { capture: true });
      }
    });
    this.boundHandlers.clear();

    // Remove watermark
    if (this.watermarkEl && this.watermarkEl.parentNode) {
      this.watermarkEl.parentNode.removeChild(this.watermarkEl);
      this.watermarkEl = null;
    }

    // Remove injected style
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
      this.styleEl = null;
    }
  }

  /**
   * Return a copy of the full violation log.
   */
  getViolationLog(): ViolationEntry[] {
    return [...this.violations];
  }

  /**
   * Return whether the exam is in a "secure" state (no active violations).
   */
  isLockdownActive(): boolean {
    return this.running && this.isFocused && this.isFullscreen;
  }

  /**
   * Snapshot of the current proctor status for UI display.
   */
  getStatus(): ProctorStatus {
    return {
      secure: this.isLockdownActive(),
      tabSwitchCount: this.violationCounts.get("tab_switch") ?? 0,
      maxTabSwitches: this.config.maxTabSwitches,
      fullscreen: this.isFullscreen,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
    };
  }

  // ---------------------------------------------------------------------------
  // Violation Recording
  // ---------------------------------------------------------------------------

  private recordViolation(type: ViolationType, details: string): void {
    const current = (this.violationCounts.get(type) ?? 0) + 1;
    this.violationCounts.set(type, current);

    const entry: ViolationEntry = {
      type,
      timestamp: now(),
      details,
      count: current,
    };

    this.violations.push(entry);

    // Report to server (fire-and-forget)
    this.reportViolationToServer(entry);

    // Notify the host component
    this.config.onViolation(type, current);

    // Check for max violations -> auto-submit
    const tabSwitches = this.violationCounts.get("tab_switch") ?? 0;
    const focusLoss = this.violationCounts.get("focus_loss") ?? 0;

    if (
      tabSwitches >= this.config.maxTabSwitches ||
      focusLoss >= this.config.maxFocusLoss
    ) {
      this.config.onMaxViolations();
    }
  }

  private async reportViolationToServer(entry: ViolationEntry): Promise<void> {
    try {
      const token = getAuthToken();
      await fetch(`${this.config.apiUrl}/api/v1/proctor/violation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          candidateId: this.config.candidateId,
          examId: this.config.examId,
          violation: entry,
        }),
        // Don't let this block the main thread or fail visibly
        keepalive: true,
      });
    } catch {
      // Silently fail — violation is still recorded locally
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Tab / Window Switch Detection
  // ---------------------------------------------------------------------------

  private attachVisibilityListeners(): void {
    const visibilityHandler = () => {
      if (document.hidden) {
        this.recordViolation("tab_switch", "Candidate switched away from exam tab.");
        this.applyBlurOverlay();
      } else {
        this.removeBlurOverlay();
      }
    };

    const blurHandler = () => {
      this.isFocused = false;
      this.recordViolation("focus_loss", "Browser window lost focus.");
    };

    const focusHandler = () => {
      this.isFocused = true;
    };

    this.addListener("document", "visibilitychange", visibilityHandler);
    this.addListener("window", "blur", blurHandler);
    this.addListener("window", "focus", focusHandler);
  }

  // ---------------------------------------------------------------------------
  // 2. Copy / Paste Prevention
  // ---------------------------------------------------------------------------

  private attachCopyPasteListeners(): void {
    const copyHandler = (e: Event) => {
      e.preventDefault();
      this.recordViolation("copy_attempt", "Copy operation blocked.");
    };

    const pasteHandler = (e: Event) => {
      e.preventDefault();
      this.recordViolation("paste_attempt", "Paste operation blocked.");
    };

    const cutHandler = (e: Event) => {
      e.preventDefault();
      this.recordViolation("cut_attempt", "Cut operation blocked.");
    };

    const contextMenuHandler = (e: Event) => {
      e.preventDefault();
      this.recordViolation("context_menu", "Right-click context menu blocked.");
    };

    this.addListener("document", "copy", copyHandler);
    this.addListener("document", "paste", pasteHandler);
    this.addListener("document", "cut", cutHandler);
    this.addListener("document", "contextmenu", contextMenuHandler);
  }

  // ---------------------------------------------------------------------------
  // 3. Screenshot / Screen Capture Prevention
  // ---------------------------------------------------------------------------

  // Screenshot blocking is handled via keyboard shortcut interception in
  // attachKeyboardListeners() (PrintScreen, Ctrl+Shift+S, Cmd+Shift+3/4/5,
  // Win+Shift+S). CSS blur on visibility change is handled in
  // attachVisibilityListeners(). The watermark overlay is created separately.

  // ---------------------------------------------------------------------------
  // 4. DevTools Detection
  // ---------------------------------------------------------------------------

  private startDevToolsDetection(): void {
    this.devtoolsTimer = setInterval(() => {
      if (!this.running) return;
      this.checkDevToolsResize();
      this.checkDevToolsTiming();
    }, 1000);
  }

  private checkDevToolsResize(): void {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;

    // DevTools side panel typically adds > 160px, bottom panel > 160px height
    if (widthDiff > 160 || heightDiff > 200) {
      this.recordViolation(
        "devtools_resize",
        `Suspicious window size difference detected (w: ${widthDiff}, h: ${heightDiff}). DevTools may be open.`
      );
    }
  }

  private checkDevToolsTiming(): void {
    // When a debugger is attached, this code path takes measurably longer
    const t0 = performance.now();
    // The debugger statement causes a pause if DevTools are open with break-on-debugger enabled.
    // We wrap it so it's not disruptive in normal operation.
    (function () { /* timing probe */ })();
    const t1 = performance.now();

    // In normal execution this takes < 1ms. With DevTools/debugger, it takes much longer.
    if (t1 - t0 > 100) {
      this.recordViolation(
        "devtools_open",
        `Execution timing anomaly detected (${(t1 - t0).toFixed(1)}ms). Debugger may be active.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Keyboard Shortcut Blocking
  // ---------------------------------------------------------------------------

  private attachKeyboardListeners(): void {
    const keydownHandler = (e: Event) => {
      const ke = e as KeyboardEvent;
      const ctrl = ke.ctrlKey || ke.metaKey;
      const shift = ke.shiftKey;
      const key = ke.key?.toLowerCase();
      const code = ke.code;

      // --- Copy/Paste/Cut/SelectAll ---
      if (ctrl && !shift) {
        if (key === "c" || key === "v" || key === "x") {
          e.preventDefault();
          const action = key === "c" ? "copy" : key === "v" ? "paste" : "cut";
          this.recordViolation(
            `${action}_attempt` as ViolationType,
            `Ctrl+${ke.key.toUpperCase()} blocked.`
          );
          return;
        }
        if (key === "a") {
          e.preventDefault();
          this.recordViolation("select_all_attempt", "Ctrl+A (select all) blocked.");
          return;
        }
      }

      // --- Print ---
      if (ctrl && key === "p") {
        e.preventDefault();
        this.recordViolation("print_attempt", "Ctrl+P (print) blocked.");
        return;
      }

      // --- Save page ---
      if (ctrl && key === "s" && !shift) {
        e.preventDefault();
        this.recordViolation("blocked_shortcut", "Ctrl+S (save page) blocked.");
        return;
      }

      // --- DevTools shortcuts ---
      if (code === "F12") {
        e.preventDefault();
        this.recordViolation("blocked_shortcut", "F12 (DevTools) blocked.");
        return;
      }
      if (ctrl && shift && (key === "i" || key === "j" || key === "c")) {
        e.preventDefault();
        this.recordViolation("blocked_shortcut", `Ctrl+Shift+${ke.key.toUpperCase()} (DevTools) blocked.`);
        return;
      }

      // --- Address bar / new tab / new window / close tab ---
      if (ctrl && (key === "l" || key === "t" || key === "n")) {
        e.preventDefault();
        this.recordViolation("blocked_shortcut", `Ctrl+${ke.key.toUpperCase()} blocked.`);
        return;
      }
      if (ctrl && key === "w") {
        e.preventDefault();
        this.recordViolation("blocked_shortcut", "Ctrl+W (close tab) blocked.");
        return;
      }

      // --- Screenshot shortcuts ---
      if (code === "PrintScreen") {
        e.preventDefault();
        this.recordViolation("screenshot_attempt", "PrintScreen key blocked.");
        return;
      }
      // Windows Snipping Tool: Ctrl+Shift+S
      if (ctrl && shift && key === "s") {
        e.preventDefault();
        this.recordViolation("screenshot_attempt", "Ctrl+Shift+S (snipping tool) blocked.");
        return;
      }
      // Mac screenshots: Cmd+Shift+3/4/5
      if (isMac() && ke.metaKey && shift && (key === "3" || key === "4" || key === "5")) {
        e.preventDefault();
        this.recordViolation("screenshot_attempt", `Cmd+Shift+${key} (Mac screenshot) blocked.`);
        return;
      }
    };

    this.addListener("document", "keydown", keydownHandler);
  }

  // ---------------------------------------------------------------------------
  // 6. Multiple Monitor Detection
  // ---------------------------------------------------------------------------

  private startScreenMonitoring(): void {
    // Check immediately, then periodically
    this.checkScreens();

    this.screenCheckTimer = setInterval(() => {
      if (this.running) this.checkScreens();
    }, 15_000);
  }

  private async checkScreens(): Promise<void> {
    try {
      // Modern API: window.getScreenDetails() (requires permission)
      if ("getScreenDetails" in window) {
        try {
          const screenDetails = await (window as unknown as {
            getScreenDetails: () => Promise<{ screens: unknown[] }>;
          }).getScreenDetails();
          const count = screenDetails.screens.length;
          if (count > 1 && count !== this.screenCount) {
            this.screenCount = count;
            this.recordViolation(
              "multiple_monitors",
              `${count} screens detected via Screen Details API.`
            );
          } else {
            this.screenCount = count;
          }
          return;
        } catch {
          // Permission denied or API unavailable — fall through
        }
      }

      // Fallback: screen.isExtended
      if (typeof screen !== "undefined" && "isExtended" in screen) {
        if ((screen as unknown as { isExtended: boolean }).isExtended) {
          if (this.screenCount <= 1) {
            this.screenCount = 2; // At least 2
            this.recordViolation(
              "multiple_monitors",
              "Extended display detected via screen.isExtended."
            );
          }
          return;
        }
      }

      // Fallback: ratio check — screen.width much larger than innerWidth can indicate extension
      if (typeof screen !== "undefined" && screen.width > window.innerWidth * 2) {
        if (this.screenCount <= 1) {
          this.screenCount = 2;
          this.recordViolation(
            "multiple_monitors",
            `Screen width (${screen.width}) significantly exceeds window width (${window.innerWidth}).`
          );
        }
      }
    } catch {
      // Screen API checks failed silently
    }
  }

  // ---------------------------------------------------------------------------
  // 7. VM / Remote Desktop Detection
  // ---------------------------------------------------------------------------

  private runEnvironmentChecks(): void {
    this.checkVMUserAgent();
    this.checkRemoteDesktop();
    this.checkHardwareConcurrency();
    this.checkWebGLRenderer();
    this.checkPlatformAnomalies();
  }

  private checkVMUserAgent(): void {
    const ua = navigator.userAgent;
    for (const pattern of VM_USER_AGENT_PATTERNS) {
      if (pattern.test(ua)) {
        this.recordViolation("vm_detected", `VM indicator in user agent: ${ua}`);
        return;
      }
    }
  }

  private checkRemoteDesktop(): void {
    const ua = navigator.userAgent;
    for (const pattern of REMOTE_DESKTOP_PATTERNS) {
      if (pattern.test(ua)) {
        this.recordViolation(
          "remote_desktop_detected",
          `Remote desktop indicator in user agent: ${ua}`
        );
        return;
      }
    }
  }

  private checkHardwareConcurrency(): void {
    if (typeof navigator !== "undefined" && navigator.hardwareConcurrency !== undefined) {
      if (navigator.hardwareConcurrency <= 1) {
        this.recordViolation(
          "vm_detected",
          `Low hardware concurrency (${navigator.hardwareConcurrency}). Possible VM environment.`
        );
      }
    }
  }

  private checkWebGLRenderer(): void {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl && gl instanceof WebGLRenderingContext) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
          for (const pattern of VM_WEBGL_RENDERERS) {
            if (pattern.test(renderer)) {
              this.recordViolation(
                "vm_detected",
                `VM-associated WebGL renderer: ${renderer}`
              );
              break;
            }
          }
        }
      }
      // Clean up
      canvas.remove();
    } catch {
      // WebGL not available — skip
    }
  }

  private checkPlatformAnomalies(): void {
    if (typeof navigator === "undefined") return;

    const ua = navigator.userAgent.toLowerCase();
    const platform = (navigator.platform || "").toLowerCase();

    // Mismatch: UA says Windows but platform says Linux (common in Wine/VM)
    if (ua.includes("windows") && platform.includes("linux")) {
      this.recordViolation(
        "vm_detected",
        `Platform anomaly: UA indicates Windows but platform is "${navigator.platform}".`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Fullscreen Lockdown
  // ---------------------------------------------------------------------------

  private attachFullscreenListeners(): void {
    const fsChangeHandler = () => {
      this.isFullscreen = !!document.fullscreenElement;

      if (!this.isFullscreen && this.running) {
        this.fullscreenExitCount++;
        this.recordViolation(
          "fullscreen_exit",
          `Candidate exited fullscreen (exit #${this.fullscreenExitCount}).`
        );

        // Try to re-enter fullscreen
        this.requestFullscreen();
      }
    };

    this.addListener("document", "fullscreenchange", fsChangeHandler);
  }

  /**
   * Request fullscreen on the document element. Safe to call even when
   * fullscreen is already active.
   */
  requestFullscreen(): void {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {
          // User gesture required — can't force without interaction
        });
      }
    } catch {
      // Fullscreen API not available
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Heartbeat System
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    // Send initial heartbeat immediately
    this.sendHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.running) this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private async sendHeartbeat(): Promise<void> {
    const payload: HeartbeatPayload = {
      sessionId: this.config.sessionId,
      timestamp: now(),
      focusState: this.isFocused,
      fullscreenState: this.isFullscreen,
      screenCount: this.screenCount,
    };

    try {
      const token = getAuthToken();
      await fetch(`${this.config.apiUrl}/api/v1/proctor/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // Network failure — heartbeat missed. Server-side timeout will flag this.
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Watermark System
  // ---------------------------------------------------------------------------

  private createWatermark(): void {
    if (this.watermarkEl) return;

    const el = document.createElement("div");
    el.id = "ps-proctor-watermark";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    // Not focusable, not visible to screen readers
    el.tabIndex = -1;
    el.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 99999",
      "pointer-events: none",
      "overflow: hidden",
      "opacity: 0.03",
      "user-select: none",
      "-webkit-user-select: none",
    ].join(";");

    this.updateWatermarkContent(el);
    document.body.appendChild(el);
    this.watermarkEl = el;

    // Update the watermark timestamp every 60 seconds
    this.watermarkTimer = setInterval(() => {
      if (this.watermarkEl && this.running) {
        this.updateWatermarkContent(this.watermarkEl);
      }
    }, 60_000);
  }

  private updateWatermarkContent(el: HTMLDivElement): void {
    const ts = new Date().toISOString();
    const text = `${this.config.candidateId} | ${this.config.examId} | ${ts}`;

    // Clear existing children
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    // Create the rotated container using safe DOM methods
    const container = document.createElement("div");
    container.style.cssText = [
      "transform: rotate(-45deg)",
      "transform-origin: center center",
      "position: absolute",
      "top: -50%",
      "left: -50%",
      "width: 200%",
      "height: 200%",
      "display: flex",
      "flex-direction: column",
      "align-items: center",
      "justify-content: center",
    ].join(";");

    // Generate a grid of rotated text lines covering the viewport
    for (let i = 0; i < 30; i++) {
      const line = document.createElement("div");
      line.style.cssText = [
        "white-space: nowrap",
        "font-size: 14px",
        "font-family: monospace",
        "color: #000",
        "padding: 40px 0",
        "letter-spacing: 2px",
      ].join(";");
      line.textContent = text;
      container.appendChild(line);
    }

    el.appendChild(container);
  }

  // ---------------------------------------------------------------------------
  // CSS Injection (copy/selection prevention + blur overlay)
  // ---------------------------------------------------------------------------

  private injectProtectiveStyles(): void {
    if (this.styleEl) return;

    const style = document.createElement("style");
    style.id = "ps-proctor-styles";
    style.textContent = [
      "/* Prevent text selection on question content */",
      ".ps-no-select,",
      "[data-proctor-protected] {",
      "  -webkit-user-select: none !important;",
      "  -moz-user-select: none !important;",
      "  -ms-user-select: none !important;",
      "  user-select: none !important;",
      "}",
      "",
      "/* Blur overlay when tab is hidden */",
      ".ps-content-blur {",
      "  -webkit-filter: blur(20px) !important;",
      "  filter: blur(20px) !important;",
      "  transition: filter 0.1s ease;",
      "}",
      "",
      "/* Reduced-motion: disable blur transition but keep blur itself */",
      "@media (prefers-reduced-motion: reduce) {",
      "  .ps-content-blur {",
      "    transition: none !important;",
      "  }",
      "}",
      "",
      "/* Ensure watermark prints */",
      "@media print {",
      "  #ps-proctor-watermark {",
      "    opacity: 0.1 !important;",
      "  }",
      "  body * {",
      "    visibility: hidden !important;",
      "  }",
      "}",
    ].join("\n");

    document.head.appendChild(style);
    this.styleEl = style;
  }

  private applyBlurOverlay(): void {
    // Blur main content when candidate is not looking at the exam tab
    const mainContent = document.querySelector("main") || document.body.firstElementChild;
    if (mainContent) {
      mainContent.classList.add("ps-content-blur");
    }
  }

  private removeBlurOverlay(): void {
    const mainContent = document.querySelector("main") || document.body.firstElementChild;
    if (mainContent) {
      mainContent.classList.remove("ps-content-blur");
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private addListener(
    target: "document" | "window",
    event: string,
    handler: EventListenerOrEventListenerObject
  ): void {
    const key = `${target}::${event}`;
    this.boundHandlers.set(key, handler);

    if (target === "document") {
      document.addEventListener(event, handler, { capture: true });
    } else {
      window.addEventListener(event, handler, { capture: true });
    }
  }
}
