"use client";

import { useEffect, useRef, useCallback } from "react";
import AnimatedCounter from "@/components/AnimatedCounter";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Intersection Observer hook for scroll-triggered fade-in animations
// ---------------------------------------------------------------------------
function useRevealOnScroll() {
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback((index: number) => {
    return (el: HTMLElement | null) => {
      sectionRefs.current[index] = el;
    };
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const els = sectionRefs.current.filter(Boolean) as HTMLElement[];

    if (prefersReduced) {
      // Make everything visible immediately
      els.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("about-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return setRef;
}

// ---------------------------------------------------------------------------
// Small SVG illustrations (inline, no external deps)
// ---------------------------------------------------------------------------

function ScrollIndicator() {
  return (
    <div className="about-scroll-hint" aria-hidden="true">
      <svg
        width="24"
        height="36"
        viewBox="0 0 24 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="about-mouse"
      >
        <rect
          x="1"
          y="1"
          width="22"
          height="34"
          rx="11"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle className="about-mouse-dot" cx="12" cy="10" r="2" fill="currentColor" />
      </svg>
      <span className="text-sm mt-2 tracking-widest uppercase opacity-50">
        Scroll
      </span>
    </div>
  );
}

function HandoffArrow() {
  return (
    <svg
      width="28"
      height="16"
      viewBox="0 0 28 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 opacity-40"
    >
      <path
        d="M0 8h24m0 0l-6-6m6 6l-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperFanIcon() {
  return (
    <div className="about-paper-fan" aria-hidden="true">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="about-paper-card"
          style={{
            transform: `rotate(${(i - 2) * 8}deg) translateY(${Math.abs(i - 2) * 4}px)`,
            zIndex: 5 - Math.abs(i - 2),
            opacity: 1 - Math.abs(i - 2) * 0.15,
          }}
        >
          <div className="h-1.5 w-10 bg-current opacity-30 rounded mb-1" />
          <div className="h-1.5 w-8 bg-current opacity-20 rounded mb-1" />
          <div className="h-1.5 w-11 bg-current opacity-30 rounded mb-1" />
          <div className="h-1.5 w-6 bg-current opacity-20 rounded" />
        </div>
      ))}
    </div>
  );
}

function NetworkGraphIcon() {
  return (
    <svg
      width="200"
      height="140"
      viewBox="0 0 200 140"
      fill="none"
      aria-hidden="true"
      className="mx-auto opacity-80"
    >
      {/* Nodes */}
      <circle cx="100" cy="70" r="8" fill="#ef4444" />
      <circle cx="50" cy="30" r="6" fill="#f97316" />
      <circle cx="150" cy="30" r="6" fill="#f97316" />
      <circle cx="30" cy="90" r="6" fill="#f97316" />
      <circle cx="170" cy="90" r="6" fill="#f97316" />
      <circle cx="60" cy="120" r="5" fill="#fbbf24" />
      <circle cx="140" cy="120" r="5" fill="#fbbf24" />
      <circle cx="100" cy="15" r="5" fill="#fbbf24" />
      {/* Edges — suspicious connections */}
      <line x1="100" y1="70" x2="50" y2="30" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
      <line x1="100" y1="70" x2="150" y2="30" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
      <line x1="100" y1="70" x2="30" y2="90" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
      <line x1="100" y1="70" x2="170" y2="90" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
      <line x1="50" y1="30" x2="100" y2="15" stroke="#f97316" strokeWidth="1.5" opacity="0.6" />
      <line x1="150" y1="30" x2="100" y2="15" stroke="#f97316" strokeWidth="1.5" opacity="0.6" />
      <line x1="30" y1="90" x2="60" y2="120" stroke="#f97316" strokeWidth="1.5" opacity="0.6" />
      <line x1="170" y1="90" x2="140" y2="120" stroke="#f97316" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

function ShieldLockIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="mx-auto mb-6 opacity-90"
    >
      <path
        d="M32 4L6 16v16c0 14.4 11.1 27.8 26 32 14.9-4.2 26-17.6 26-32V16L32 4z"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
      <rect x="24" y="26" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M28 26v-4a4 4 0 018 0v4" stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="33" r="2" fill="currentColor" />
      <line x1="32" y1="35" x2="32" y2="38" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function BlockchainIcon() {
  return (
    <svg
      width="220"
      height="56"
      viewBox="0 0 220 56"
      fill="none"
      aria-hidden="true"
      className="mx-auto mb-6 opacity-80"
    >
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={8 + i * 56}
            y="8"
            width="40"
            height="40"
            rx="6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <text
            x={28 + i * 56}
            y="33"
            textAnchor="middle"
            fill="currentColor"
            fontSize="11"
            fontFamily="monospace"
          >
            #{i + 1}
          </text>
          {i < 3 && (
            <line
              x1={48 + i * 56}
              y1="28"
              x2={64 + i * 56}
              y2="28"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />
          )}
        </g>
      ))}
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0 0L6 3L0 6z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function AboutPage() {
  const setRef = useRevealOnScroll();

  return (
    <div className="about-page">
      {/* ================================================================ */}
      {/* Section 1 — Hero                                                 */}
      {/* ================================================================ */}
      <section
        ref={setRef(0)}
        className="about-section about-hero about-fade-in"
      >
        <div className="about-section-inner">
          <h1 className="about-hero-headline">
            The exam should test <em>your</em> knowledge.
            <br />
            Not the system&apos;s integrity.
          </h1>
          <p className="about-hero-sub">
            <strong>ParikshaSuraksha</strong> — Because 300 million aspirants
            deserve a fair chance.
          </p>
          <ScrollIndicator />
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 2 — The Crisis                                           */}
      {/* ================================================================ */}
      <section
        ref={setRef(1)}
        className="about-section about-crisis about-fade-in"
      >
        <div className="about-section-inner">
          <h2 className="about-section-label">The Crisis</h2>

          <div className="about-stats-grid">
            <div className="about-stat">
              <AnimatedCounter
                target={40}
                suffix="+"
                duration={1800}
                className="about-stat-number"
              />
              <p className="about-stat-desc">
                paper leaks in 2023-2024
              </p>
            </div>
            <div className="about-stat">
              <AnimatedCounter
                target={24}
                suffix=" lakh"
                duration={2000}
                className="about-stat-number"
              />
              <p className="about-stat-desc">
                candidates affected by NEET-UG 2024
              </p>
            </div>
            <div className="about-stat">
              <AnimatedCounter
                target={600}
                prefix="₹"
                suffix="+ crore"
                duration={2200}
                className="about-stat-number"
              />
              <p className="about-stat-desc">
                wasted per cancelled exam
              </p>
            </div>
            <div className="about-stat">
              <AnimatedCounter
                target={15}
                suffix=" million"
                duration={2400}
                className="about-stat-number"
              />
              <p className="about-stat-desc">
                dreams on hold
              </p>
            </div>
          </div>

          <p className="about-body-text mt-10 max-w-2xl mx-auto">
            Behind every number is a student who studied for years — and a system
            that failed them. Leaked papers. Cancelled exams. Supreme Court
            hearings. And still, nothing changes.
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 3 — The Root Cause                                       */}
      {/* ================================================================ */}
      <section
        ref={setRef(2)}
        className="about-section about-root-cause about-fade-in"
      >
        <div className="about-section-inner">
          <h2 className="about-section-label">The Root Cause</h2>

          <div className="about-handoff-chain">
            {[
              "Question Setters",
              "Moderators",
              "Printing Press",
              "Secure Storage",
              "District Transport",
              "Center Coordinator",
              "Invigilator",
            ].map((step, i) => (
              <div key={step} className="about-handoff-step">
                {i > 0 && <HandoffArrow />}
                <span className="about-handoff-label">{step}</span>
              </div>
            ))}
          </div>

          <p className="about-quote mt-10">
            One paper. Millions of candidates.
            <br />
            A single point of failure.
          </p>

          <p className="about-body-text mt-8 max-w-xl mx-auto text-lg">
            What if the question paper simply&hellip; <em>didn&apos;t exist?</em>
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 4 — Unique Papers                                        */}
      {/* ================================================================ */}
      <section
        ref={setRef(3)}
        className="about-section about-innovation about-fade-in"
      >
        <div className="about-section-inner">
          <p className="about-overline">Innovation I</p>
          <h2 className="about-innovation-headline">
            Every candidate. Every paper. <span className="text-indigo-400">Unique.</span>
          </h2>

          <PaperFanIcon />

          <p className="about-body-text max-w-xl mx-auto mt-8">
            Your paper is generated just for you. Same difficulty. Same topics.
            Different questions. Leaking one paper is useless — because no two
            papers are the same.
          </p>

          <p className="about-mono-highlight mt-6">
            O(1) — generated in under a millisecond
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 5 — Cheat Detection                                      */}
      {/* ================================================================ */}
      <section
        ref={setRef(4)}
        className="about-section about-detection about-fade-in"
      >
        <div className="about-section-inner">
          <p className="about-overline">Innovation II</p>
          <h2 className="about-innovation-headline">
            We see patterns <span className="text-orange-400">humans can&apos;t.</span>
          </h2>

          <NetworkGraphIcon />

          <p className="about-body-text max-w-xl mx-auto mt-6">
            If two candidates at the same center pick the same wrong answers on
            hard questions — that&apos;s not luck. That&apos;s collusion.
          </p>

          <p className="about-mono-highlight mt-6">
            Mathematical proof. Not guesswork. False positive rate: 0.0001%
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 6 — Zero Knowledge                                       */}
      {/* ================================================================ */}
      <section
        ref={setRef(5)}
        className="about-section about-zero-knowledge about-fade-in"
      >
        <div className="about-section-inner">
          <p className="about-overline">Innovation III</p>
          <h2 className="about-innovation-headline">
            The complete paper <span className="text-emerald-400">never exists.</span>
            <br />
            Until the exam starts.
          </h2>

          <ShieldLockIcon />

          <p className="about-body-text max-w-xl mx-auto">
            Each question is encrypted individually. Keys are time-locked until
            the moment the exam begins. Not even we can see your paper early.
          </p>

          <p className="about-mono-highlight mt-6">
            Time-locked cryptography + blockchain audit trail
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 7 — One More Thing: Blockchain Verification              */}
      {/* ================================================================ */}
      <section
        ref={setRef(6)}
        className="about-section about-one-more-thing about-fade-in"
      >
        <div className="about-section-inner">
          <p className="about-overline about-overline-special">One more thing.</p>
          <h2 className="about-innovation-headline mt-4">
            Don&apos;t trust us. <span className="text-amber-400">Verify.</span>
          </h2>

          <BlockchainIcon />

          <p className="about-body-text max-w-xl mx-auto">
            Every candidate gets a verification hash. Check it yourself — that
            your paper was generated fairly, that your answers were recorded
            correctly, that no one tampered with the process.
          </p>

          <p className="about-body-text max-w-xl mx-auto mt-2 opacity-70">
            The blockchain doesn&apos;t lie.
          </p>

          <Link
            href="/verify"
            className="about-cta-button mt-8 inline-block"
          >
            Verify your exam &rarr;
          </Link>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 8 — The Numbers                                          */}
      {/* ================================================================ */}
      <section
        ref={setRef(7)}
        className="about-section about-proof about-fade-in"
      >
        <div className="about-section-inner">
          <h2 className="about-section-label">The Numbers</h2>

          <div className="about-proof-grid">
            {[
              { label: "Paper generation", value: "O(1)", sub: "1 ms per candidate" },
              { label: "Concurrent candidates", value: "10,000+", sub: "Horizontally scalable" },
              { label: "Layers of defense", value: "7", sub: "Defense in depth" },
              { label: "Encryption standard", value: "AES-256-GCM", sub: "Military grade" },
              { label: "Blockchain verification", value: "Hyperledger Fabric", sub: "3 independent orgs verify" },
              { label: "False positive rate", value: "<0.0001%", sub: "Mathematical certainty" },
            ].map((item) => (
              <div key={item.label} className="about-proof-card">
                <p className="about-proof-value">{item.value}</p>
                <p className="about-proof-label">{item.label}</p>
                <p className="about-proof-sub">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 9 — Built for India                                      */}
      {/* ================================================================ */}
      <section
        ref={setRef(8)}
        className="about-section about-global about-fade-in"
      >
        <div className="about-section-inner">
          <h2 className="about-innovation-headline">
            Built for India.
            <br />
            Ready for the world.
          </h2>

          <p className="about-body-text max-w-2xl mx-auto mt-6">
            Exam fraud is a{" "}
            <strong className="text-amber-400">$14.8 billion</strong> global
            problem. From China&apos;s Gaokao to UK A-Levels to the US SAT —
            wherever exams decide futures, integrity must be absolute.
          </p>

          <p className="about-quote mt-8">
            Built in India. For India. And beyond.
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 10 — Call to Action                                      */}
      {/* ================================================================ */}
      <section
        ref={setRef(9)}
        className="about-section about-cta about-fade-in"
      >
        <div className="about-section-inner">
          <h2 className="about-cta-title">
            Pariksha Suraksha.
          </h2>
          <p className="about-cta-hindi">
            परीक्षा सुरक्षा।
          </p>
          <p className="about-cta-tagline">
            Protecting the exam. Protecting the dream.
          </p>

          <div className="about-cta-badge">
            <span className="about-badge-dmj">a dmj.one initiative</span>
          </div>

          <p className="about-cta-vision">
            Aatmnirbhar Viksit Bharat 2047
          </p>

          <div className="about-cta-links">
            <Link href="/" className="about-cta-button">
              Back to Home
            </Link>
            <Link href="/verify" className="about-cta-button-outline">
              Verify an Exam
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Scoped styles                                                    */}
      {/* ================================================================ */}
      <style jsx global>{`
        /* ---- Page container with scroll snap ---- */
        .about-page {
          --about-saffron: #f97316;
          --about-indigo: #6366f1;
          --about-dark: #0a0a1a;
          --about-dark-card: #13132b;
          background: var(--about-dark);
          color: #e2e8f0;
          overflow-x: hidden;
        }

        @supports (scroll-snap-type: y mandatory) {
          .about-page {
            height: 100vh;
            overflow-y: auto;
            scroll-snap-type: y mandatory;
            scroll-behavior: smooth;
          }
        }

        /* ---- Section defaults ---- */
        .about-section {
          min-height: 100vh;
          scroll-snap-align: start;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 4rem 1.5rem;
          position: relative;
        }

        .about-section-inner {
          max-width: 72rem;
          width: 100%;
          margin: 0 auto;
        }

        /* ---- Reveal animation ---- */
        .about-fade-in {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .about-revealed {
          opacity: 1 !important;
          transform: none !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .about-fade-in {
            opacity: 1;
            transform: none;
            transition: none;
          }
        }

        /* ---- Hero ---- */
        .about-hero {
          background: radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 70%),
                      var(--about-dark);
        }

        .about-hero-headline {
          font-size: clamp(1.75rem, 5vw, 3.5rem);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.02em;
          max-width: 52rem;
          margin: 0 auto 1.5rem;
        }

        .about-hero-headline em {
          font-style: normal;
          color: var(--about-indigo);
        }

        .about-hero-sub {
          font-size: clamp(1rem, 2vw, 1.35rem);
          opacity: 0.7;
          max-width: 36rem;
          margin: 0 auto 3rem;
          line-height: 1.6;
        }

        /* ---- Scroll indicator ---- */
        .about-scroll-hint {
          display: flex;
          flex-direction: column;
          align-items: center;
          opacity: 0.5;
        }

        .about-mouse-dot {
          animation: about-scroll-bob 1.8s ease-in-out infinite;
        }

        @keyframes about-scroll-bob {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(8px); opacity: 0.3; }
        }

        @media (prefers-reduced-motion: reduce) {
          .about-mouse-dot { animation: none; }
        }

        /* ---- Section labels / overlines ---- */
        .about-section-label {
          font-size: clamp(1.5rem, 3.5vw, 2.5rem);
          font-weight: 700;
          margin-bottom: 2.5rem;
          letter-spacing: -0.01em;
        }

        .about-overline {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--about-indigo);
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        .about-overline-special {
          font-size: 1.1rem;
          color: var(--about-saffron);
          letter-spacing: 0.15em;
        }

        /* ---- Innovation headlines ---- */
        .about-innovation-headline {
          font-size: clamp(1.5rem, 4vw, 3rem);
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.02em;
          margin-bottom: 1.5rem;
        }

        /* ---- Stats grid (Crisis section) ---- */
        .about-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 2rem;
          max-width: 56rem;
          margin: 0 auto;
        }

        .about-stat {
          padding: 1.5rem;
        }

        .about-stat-number {
          display: block;
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          color: #ef4444;
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
        }

        .about-stat-desc {
          margin-top: 0.5rem;
          font-size: 0.95rem;
          opacity: 0.6;
          line-height: 1.4;
        }

        /* ---- Body text ---- */
        .about-body-text {
          font-size: 1.1rem;
          line-height: 1.7;
          opacity: 0.8;
        }

        .about-quote {
          font-size: clamp(1.25rem, 3vw, 1.75rem);
          font-weight: 600;
          line-height: 1.4;
          opacity: 0.9;
        }

        .about-mono-highlight {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.9rem;
          color: var(--about-indigo);
          background: rgba(99, 102, 241, 0.1);
          padding: 0.5rem 1.25rem;
          border-radius: 9999px;
          display: inline-block;
          letter-spacing: 0.02em;
        }

        /* ---- Root-cause handoff chain ---- */
        .about-handoff-chain {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.5rem 0.25rem;
          max-width: 56rem;
          margin: 0 auto;
        }

        .about-handoff-step {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .about-handoff-label {
          font-size: 0.8rem;
          font-weight: 500;
          padding: 0.4rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 0.5rem;
          white-space: nowrap;
          background: rgba(255, 255, 255, 0.04);
        }

        /* ---- Paper fan illustration ---- */
        .about-paper-fan {
          display: flex;
          justify-content: center;
          align-items: end;
          gap: 0;
          margin: 2rem auto;
          position: relative;
          height: 100px;
        }

        .about-paper-card {
          width: 64px;
          padding: 10px 8px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 6px;
          position: absolute;
          transition: transform 0.3s ease;
        }

        /* ---- Proof grid ---- */
        .about-proof-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          max-width: 64rem;
          margin: 0 auto;
        }

        .about-proof-card {
          background: var(--about-dark-card);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.75rem;
          padding: 1.5rem;
          text-align: left;
        }

        .about-proof-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--about-indigo);
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          margin-bottom: 0.25rem;
        }

        .about-proof-label {
          font-size: 0.95rem;
          font-weight: 500;
          opacity: 0.9;
        }

        .about-proof-sub {
          font-size: 0.8rem;
          opacity: 0.5;
          margin-top: 0.25rem;
        }

        /* ---- CTA section ---- */
        .about-cta {
          background: radial-gradient(ellipse at 50% 100%, rgba(249, 115, 22, 0.1) 0%, transparent 60%),
                      var(--about-dark);
        }

        .about-cta-title {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 0.5rem;
        }

        .about-cta-hindi {
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          font-weight: 600;
          opacity: 0.8;
          margin-bottom: 1.5rem;
        }

        .about-cta-tagline {
          font-size: clamp(1rem, 2vw, 1.35rem);
          opacity: 0.7;
          margin-bottom: 2rem;
        }

        .about-cta-badge {
          margin-bottom: 1.5rem;
        }

        .about-badge-dmj {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          padding: 0.5rem 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 9999px;
          opacity: 0.6;
        }

        .about-cta-vision {
          font-size: 0.9rem;
          opacity: 0.45;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 2.5rem;
        }

        .about-cta-links {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* ---- Buttons ---- */
        .about-cta-button {
          display: inline-block;
          padding: 0.75rem 2rem;
          background: var(--about-indigo);
          color: #fff;
          border-radius: 0.5rem;
          font-weight: 600;
          font-size: 0.95rem;
          text-decoration: none;
          transition: background 0.2s, transform 0.2s;
        }

        .about-cta-button:hover {
          background: #4f46e5;
          transform: translateY(-1px);
        }

        .about-cta-button-outline {
          display: inline-block;
          padding: 0.75rem 2rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #e2e8f0;
          border-radius: 0.5rem;
          font-weight: 600;
          font-size: 0.95rem;
          text-decoration: none;
          transition: border-color 0.2s, transform 0.2s;
        }

        .about-cta-button-outline:hover {
          border-color: rgba(255, 255, 255, 0.5);
          transform: translateY(-1px);
        }

        @media (prefers-reduced-motion: reduce) {
          .about-cta-button,
          .about-cta-button-outline {
            transition: none;
          }
        }

        /* ---- Section-specific backgrounds ---- */
        .about-crisis {
          background: radial-gradient(ellipse at 50% 50%, rgba(239, 68, 68, 0.06) 0%, transparent 70%),
                      var(--about-dark);
        }

        .about-one-more-thing {
          background: radial-gradient(ellipse at 50% 50%, rgba(249, 115, 22, 0.08) 0%, transparent 60%),
                      var(--about-dark);
        }

        .about-detection {
          background: radial-gradient(ellipse at 50% 50%, rgba(249, 115, 22, 0.05) 0%, transparent 60%),
                      var(--about-dark);
        }

        .about-zero-knowledge {
          background: radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.05) 0%, transparent 60%),
                      var(--about-dark);
        }

        .about-global {
          background: radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.06) 0%, transparent 60%),
                      var(--about-dark);
        }

        /* ---- Mobile adjustments ---- */
        @media (max-width: 640px) {
          .about-section {
            padding: 3rem 1rem;
            min-height: 100svh;
          }

          .about-stats-grid {
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
          }

          .about-proof-grid {
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
          }

          .about-proof-card {
            padding: 1rem;
          }

          .about-handoff-chain {
            gap: 0.4rem 0.15rem;
          }

          .about-handoff-label {
            font-size: 0.7rem;
            padding: 0.3rem 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
