"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Eye,
  Type,
  Monitor,
  Palette,
  Minimize2,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  applyAccessibilityPreferences,
  type AccessibilityPreferences,
} from "@/lib/accessibility";

export default function AccessibilityToolbar() {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>({
    highContrast: false,
    largeFont: false,
    screenReaderOptimized: false,
    colorBlindSafe: false,
    reducedMotion: false,
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const loaded = loadAccessibilityPreferences();
    setPrefs(loaded);
    applyAccessibilityPreferences(loaded);
  }, []);

  const updatePref = useCallback(
    (key: keyof AccessibilityPreferences, value: boolean) => {
      const newPrefs = { ...prefs, [key]: value };
      setPrefs(newPrefs);
      saveAccessibilityPreferences(newPrefs);
      applyAccessibilityPreferences(newPrefs);
    },
    [prefs]
  );

  return (
    <div className="no-print">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed top-4 right-4 z-50 p-2 rounded-lg shadow-lg transition-colors",
          "bg-pariksha-600 text-white hover:bg-pariksha-700",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        aria-label={isOpen ? "Close accessibility settings" : "Open accessibility settings"}
        aria-expanded={isOpen}
        aria-controls="accessibility-panel"
      >
        {isOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Settings className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          id="accessibility-panel"
          role="dialog"
          aria-label="Accessibility settings"
          className="fixed top-16 right-4 z-50 w-72 bg-card border rounded-lg shadow-xl p-4 space-y-3"
        >
          <h2 className="text-sm font-bold text-card-foreground mb-3">
            Accessibility Settings
          </h2>

          <ToggleItem
            icon={<Eye className="h-4 w-4" aria-hidden="true" />}
            label="High Contrast Mode"
            description="Dark background with bright text"
            checked={prefs.highContrast}
            onChange={(v) => updatePref("highContrast", v)}
          />

          <ToggleItem
            icon={<Type className="h-4 w-4" aria-hidden="true" />}
            label="Large Font (1.5x)"
            description="Increase all text sizes"
            checked={prefs.largeFont}
            onChange={(v) => updatePref("largeFont", v)}
          />

          <ToggleItem
            icon={<Monitor className="h-4 w-4" aria-hidden="true" />}
            label="Screen Reader Optimized"
            description="Enhanced ARIA descriptions"
            checked={prefs.screenReaderOptimized}
            onChange={(v) => updatePref("screenReaderOptimized", v)}
          />

          <ToggleItem
            icon={<Palette className="h-4 w-4" aria-hidden="true" />}
            label="Color-Blind Safe"
            description="Patterns + shapes for status"
            checked={prefs.colorBlindSafe}
            onChange={(v) => updatePref("colorBlindSafe", v)}
          />

          <ToggleItem
            icon={<Minimize2 className="h-4 w-4" aria-hidden="true" />}
            label="Reduced Motion"
            description="Disable animations"
            checked={prefs.reducedMotion}
            onChange={(v) => updatePref("reducedMotion", v)}
          />
        </div>
      )}
    </div>
  );
}

function ToggleItem({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `a11y-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-1">{icon}</div>
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium text-card-foreground cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 mt-1",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          checked ? "bg-pariksha-600" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
            checked ? "translate-x-6" : "translate-x-1"
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
