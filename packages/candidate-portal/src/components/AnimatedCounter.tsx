"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AnimatedCounterProps {
  target: number;
  /** Text shown after the number, e.g. "+", "%", " lakh", " crore" */
  suffix?: string;
  /** Text shown before the number, e.g. "₹" */
  prefix?: string;
  /** Animation duration in milliseconds. Default 2000. */
  duration?: number;
  /** Decimal places to show. Default 0. */
  decimals?: number;
  /** Additional CSS classes for the number */
  className?: string;
}

/**
 * Animated number counter that counts up from 0 when the element
 * enters the viewport via Intersection Observer.
 *
 * Respects `prefers-reduced-motion` — if the user prefers reduced
 * motion, the final number is shown immediately with no animation.
 */
export default function AnimatedCounter({
  target,
  suffix = "",
  prefix = "",
  duration = 2000,
  decimals = 0,
  className = "",
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState("0");
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const animate = useCallback(() => {
    // Check reduced motion preference
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplay(target.toFixed(decimals));
      setHasAnimated(true);
      return;
    }

    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;

      setDisplay(current.toFixed(decimals));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplay(target.toFixed(decimals));
        setHasAnimated(true);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration, decimals]);

  useEffect(() => {
    if (hasAnimated) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAnimated, animate]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${target.toFixed(decimals)}${suffix}`}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
