"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Timer,
  StickyNote,
  AlertTriangle,
  Zap,
  Lock,
  Brain,
  BarChart3,
  Users,
  Target,
  Rocket,
  Trophy,
  ArrowRight,
  Check,
  X,
  Minus,
  ExternalLink,
} from "lucide-react";

/* ============================================================
   DATA — 10 Slides following Guy Kawasaki's 10/20/30 format
   ============================================================ */

interface Slide {
  id: number;
  title: string;
  content: React.ReactNode;
  notes?: string;
}

/* ============================================================
   COMPONENT — Architecture Diagram (Slide 5)
   ============================================================ */
function ArchitectureDiagram() {
  return (
    <div className="w-full max-w-5xl mx-auto mt-6">
      <div className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-2">
        {/* Exam Interfaces */}
        <div className="flex-1 rounded-xl border-2 border-indigo-400/40 bg-indigo-500/10 p-4">
          <div className="text-xs uppercase tracking-widest text-indigo-300 mb-3 font-semibold">
            Exam Interfaces
          </div>
          <div className="space-y-2">
            {["Exam Center Terminal", "Admin Dashboard", "Candidate Portal"].map(
              (item) => (
                <div
                  key={item}
                  className="text-sm bg-indigo-500/20 rounded-lg px-3 py-2 text-indigo-100"
                >
                  {item}
                </div>
              )
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center lg:flex-col">
          <ArrowRight className="h-6 w-6 text-amber-400 hidden lg:block" />
          <ArrowRight className="h-6 w-6 text-amber-400 rotate-90 lg:hidden" />
        </div>

        {/* 3 Innovation Engines */}
        <div className="flex-[2] rounded-xl border-2 border-amber-400/40 bg-amber-500/10 p-4">
          <div className="text-xs uppercase tracking-widest text-amber-300 mb-3 font-semibold">
            3 Innovation Engines
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="bg-amber-500/20 rounded-lg p-3 text-center">
              <Zap className="h-5 w-5 text-amber-300 mx-auto mb-1" />
              <div className="text-xs text-amber-100 font-medium">
                Isomorphic Question Generator
              </div>
              <div className="text-[10px] text-amber-200/70 mt-1">
                IRT-calibrated O(1)
              </div>
            </div>
            <div className="bg-amber-500/20 rounded-lg p-3 text-center">
              <Brain className="h-5 w-5 text-amber-300 mx-auto mb-1" />
              <div className="text-xs text-amber-100 font-medium">
                Collusion Detection Engine
              </div>
              <div className="text-[10px] text-amber-200/70 mt-1">
                FPR &lt; 0.0001
              </div>
            </div>
            <div className="bg-amber-500/20 rounded-lg p-3 text-center">
              <Lock className="h-5 w-5 text-amber-300 mx-auto mb-1" />
              <div className="text-xs text-amber-100 font-medium">
                Zero-Knowledge Lifecycle
              </div>
              <div className="text-[10px] text-amber-200/70 mt-1">
                AES-256-GCM + time-lock
              </div>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center lg:flex-col">
          <ArrowRight className="h-6 w-6 text-amber-400 hidden lg:block" />
          <ArrowRight className="h-6 w-6 text-amber-400 rotate-90 lg:hidden" />
        </div>

        {/* Data Layer */}
        <div className="flex-1 rounded-xl border-2 border-emerald-400/40 bg-emerald-500/10 p-4">
          <div className="text-xs uppercase tracking-widest text-emerald-300 mb-3 font-semibold">
            Data Layer
          </div>
          <div className="space-y-2">
            {["Cloud KMS", "GCP / Gemini", "PostgreSQL"].map((item) => (
              <div
                key={item}
                className="text-sm bg-emerald-500/20 rounded-lg px-3 py-2 text-emerald-100"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center lg:flex-col">
          <ArrowRight className="h-6 w-6 text-amber-400 hidden lg:block" />
          <ArrowRight className="h-6 w-6 text-amber-400 rotate-90 lg:hidden" />
        </div>

        {/* Blockchain Audit */}
        <div className="flex-1 rounded-xl border-2 border-orange-400/40 bg-orange-500/10 p-4">
          <div className="text-xs uppercase tracking-widest text-orange-300 mb-3 font-semibold">
            Blockchain Audit
          </div>
          <div className="space-y-2">
            {[
              "Hyperledger Fabric",
              "Merkle Tree Verification",
              "Immutable Audit Trail",
            ].map((item) => (
              <div
                key={item}
                className="text-sm bg-orange-500/20 rounded-lg px-3 py-2 text-orange-100"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-amber-300 font-semibold mt-6 text-lg tracking-wide">
        All O(1). All real-time. All production-grade.
      </p>
    </div>
  );
}

/* ============================================================
   COMPONENT — Competitive Matrix (Slide 8)
   ============================================================ */
function CompetitiveMatrix() {
  const features = [
    "Unique Papers",
    "Collusion Detection",
    "Zero-Knowledge Lifecycle",
    "Blockchain Audit",
    "IRT Calibration",
  ];
  const competitors = [
    {
      name: "ParikshaSuraksha",
      values: [true, true, true, true, true],
      highlight: true,
    },
    { name: "NTA", values: [false, false, false, false, false] },
    {
      name: "CBT Platforms",
      values: [false, false, false, false, false],
    },
    {
      name: "Proctoring",
      values: [false, false, false, false, false],
    },
    {
      name: "Question Banks",
      values: ["partial", false, false, false, "partial"],
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 md:p-3 text-slate-400 font-medium text-xs md:text-sm">
              Capability
            </th>
            {competitors.map((c) => (
              <th
                key={c.name}
                className={`p-2 md:p-3 text-center text-xs md:text-sm font-semibold ${
                  c.highlight
                    ? "text-amber-300 bg-amber-500/10 rounded-t-lg"
                    : "text-slate-300"
                }`}
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature, fi) => (
            <tr
              key={feature}
              className={fi % 2 === 0 ? "bg-white/[0.02]" : ""}
            >
              <td className="p-2 md:p-3 text-slate-200 font-medium text-xs md:text-sm">
                {feature}
              </td>
              {competitors.map((c) => {
                const val = c.values[fi];
                return (
                  <td
                    key={c.name}
                    className={`p-2 md:p-3 text-center ${
                      c.highlight ? "bg-amber-500/10" : ""
                    }`}
                  >
                    {val === true ? (
                      <Check className="h-5 w-5 text-emerald-400 mx-auto" />
                    ) : val === "partial" ? (
                      <Minus className="h-5 w-5 text-yellow-400 mx-auto" />
                    ) : (
                      <X className="h-5 w-5 text-red-400/60 mx-auto" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-center text-indigo-300 text-xs mt-3">
        Only system with ALL THREE: unique papers + collusion detection +
        zero-knowledge lifecycle
      </p>
    </div>
  );
}

/* ============================================================
   SLIDE DEFINITIONS
   ============================================================ */
function useSlides(): Slide[] {
  return [
    /* ---- Slide 1: Title ---- */
    {
      id: 1,
      title: "Title",
      notes:
        "Open strong. Pause after tagline. Make eye contact. This is about 300M aspirants.",
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <Shield className="h-16 w-16 md:h-20 md:w-20 text-amber-400 mb-6" />
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight">
            Pariksha<span className="text-amber-400">Suraksha</span>
          </h1>
          <p className="mt-4 text-xl md:text-2xl text-indigo-300 font-medium max-w-3xl">
            AI-Powered Exam Integrity Engine
          </p>
          <p className="mt-8 text-lg md:text-xl text-slate-300 italic max-w-2xl leading-relaxed">
            &ldquo;Eliminating paper leaks. Detecting cheating. Proving
            fairness.&rdquo;
          </p>
          <div className="mt-12 flex flex-col items-center gap-2">
            <p className="text-base text-slate-400">
              By <span className="text-white font-semibold">Divya Mohan</span>{" "}
              |{" "}
              <span className="text-indigo-300">dmj.one</span>
            </p>
            <p className="text-sm text-amber-400/80 tracking-wider uppercase">
              Aatmnirbhar Viksit Bharat 2047
            </p>
          </div>
        </div>
      ),
    },

    /* ---- Slide 2: Problem / Pain ---- */
    {
      id: 2,
      title: "Problem",
      notes:
        "Let the numbers sink in. These are real students, real careers destroyed. Mention specific examples — NEET, UGC-NET.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <AlertTriangle className="h-10 w-10 text-red-400 flex-shrink-0" />
            <h2 className="text-3xl md:text-5xl font-bold text-white">
              The Crisis
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="text-3xl md:text-4xl font-extrabold text-red-400">
                40+
              </div>
              <div className="text-base text-slate-300 mt-1">
                major exam paper leaks in 2023-2024
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="text-3xl md:text-4xl font-extrabold text-red-400">
                24 lakh
              </div>
              <div className="text-base text-slate-300 mt-1">
                candidates affected by NEET-UG 2024 alone
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="text-3xl md:text-4xl font-extrabold text-red-400">
                15M+
              </div>
              <div className="text-base text-slate-300 mt-1">
                aspirants affected annually
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="text-2xl md:text-4xl font-extrabold text-red-400">
                ₹600+ Cr
              </div>
              <div className="text-base text-slate-300 mt-1">
                cost per cancelled exam cycle
              </div>
            </div>
          </div>
          <div className="mt-8 bg-slate-800/80 rounded-xl p-5 border-l-4 border-amber-400">
            <p className="text-base md:text-lg text-slate-200 leading-relaxed">
              <span className="text-white font-semibold">Root cause:</span> ONE
              question paper for ALL candidates, passing through 5-8 custody
              handoffs.
            </p>
            <p className="text-amber-300 font-semibold mt-2 text-lg">
              &ldquo;A single leaked paper destroys an entire exam.&rdquo;
            </p>
          </div>
        </div>
      ),
    },

    /* ---- Slide 3: Solution ---- */
    {
      id: 3,
      title: "Solution",
      notes:
        "Three innovations, interlocking. Emphasize: not just ONE fix — three layers that make each other stronger. The tagline lands hard.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-10">
            Three Interlocking Innovations
          </h2>
          <div className="space-y-5">
            <div className="flex gap-4 items-start bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-lg">
                1
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-indigo-300">
                  Unique Paper Per Candidate
                </h3>
                <p className="text-base text-slate-300 mt-1">
                  Same difficulty, different questions. IRT-calibrated isomorphic
                  generation ensures statistical equivalence.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">
                2
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-emerald-300">
                  AI Collusion Detection
                </h3>
                <p className="text-base text-slate-300 mt-1">
                  Statistical proof from answer patterns. Detects cheating rings
                  with FPR &lt; 0.0001 — mathematical proof, not guesswork.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg">
                3
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-amber-300">
                  Zero-Knowledge Lifecycle
                </h3>
                <p className="text-base text-slate-300 mt-1">
                  The complete paper NEVER exists until exam start.
                  Time-locked cryptography + blockchain audit trail.
                </p>
              </div>
            </div>
          </div>
          <p className="mt-8 text-lg md:text-xl text-center text-amber-300 italic font-semibold">
            &ldquo;We don&apos;t just secure the exam. We make leaking it
            mathematically useless.&rdquo;
          </p>
        </div>
      ),
    },

    /* ---- Slide 4: Value Proposition ---- */
    {
      id: 4,
      title: "Value Proposition",
      notes:
        "Three audiences, three value props. Pause after each. The tagline transitions from faith to evidence.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-10">
            Who Benefits?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-6">
              <Target className="h-8 w-8 text-indigo-400 mb-3" />
              <h3 className="text-lg font-bold text-indigo-300 mb-2">
                NTA / Exam Authorities
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>Eliminate paper leaks permanently</li>
                <li>Detect organized cheating rings</li>
                <li>Provide courts with cryptographic proof</li>
              </ul>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
              <Users className="h-8 w-8 text-emerald-400 mb-3" />
              <h3 className="text-lg font-bold text-emerald-300 mb-2">
                300M+ Candidates
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>Trust that merit determines outcomes</li>
                <li>Verify your own submission independently</li>
                <li>No more cancelled exams</li>
              </ul>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
              <Shield className="h-8 w-8 text-amber-400 mb-3" />
              <h3 className="text-lg font-bold text-amber-300 mb-2">
                Government
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>Restore public trust in examinations</li>
                <li>Prevent ₹600 Cr cancellation costs</li>
                <li>Reduce litigation and Supreme Court cases</li>
              </ul>
            </div>
          </div>
          <p className="mt-10 text-lg md:text-xl text-center text-amber-300 italic font-semibold">
            &ldquo;From faith-based trust to evidence-based proof.&rdquo;
          </p>
        </div>
      ),
    },

    /* ---- Slide 5: Technology / Underlying Magic ---- */
    {
      id: 5,
      title: "Technology",
      notes:
        "Walk through the architecture diagram left to right. Emphasize O(1) at every step. This is production-grade, not a research paper.",
      content: (
        <div className="flex flex-col justify-center h-full px-4 md:px-10 max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 text-center">
            Underlying Magic
          </h2>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full">
              O(1) Isomorphic Generation
            </span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full">
              Statistical Collusion Detection
            </span>
            <span className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full">
              Zero-Knowledge Lifecycle
            </span>
          </div>
          <ArchitectureDiagram />
        </div>
      ),
    },

    /* ---- Slide 6: Business Model ---- */
    {
      id: 6,
      title: "Business Model",
      notes:
        "B2G model. Exam conducting bodies pay per exam conduct. The TAM is enormous — India alone is massive, global is $14.8B.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">
            Business Model
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700">
              <BarChart3 className="h-8 w-8 text-indigo-400 mb-3" />
              <h3 className="text-xl font-bold text-white mb-2">
                B2G Revenue Model
              </h3>
              <p className="text-base text-slate-300">
                ₹5-50 lakh per exam conduct
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Based on candidate volume and exam complexity
              </p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700">
              <Users className="h-8 w-8 text-emerald-400 mb-3" />
              <h3 className="text-xl font-bold text-white mb-2">Customers</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                NTA (50+ exams), UPSC, SSC, IBPS, RRB, State PSCs, State Boards
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 text-center">
              <div className="text-2xl md:text-3xl font-extrabold text-indigo-300">
                ~100
              </div>
              <div className="text-sm text-slate-300 mt-1">
                major exams annually in India
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-center">
              <div className="text-2xl md:text-3xl font-extrabold text-emerald-300">
                300M+
              </div>
              <div className="text-sm text-slate-300 mt-1">
                candidates across all exams
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 text-center">
              <div className="text-2xl md:text-3xl font-extrabold text-amber-300">
                $14.8B
              </div>
              <div className="text-sm text-slate-300 mt-1">
                Global TAM by 2033 (CAGR 15.1%)
              </div>
            </div>
          </div>
        </div>
      ),
    },

    /* ---- Slide 7: Go-to-Market ---- */
    {
      id: 7,
      title: "Go-to-Market",
      notes:
        "Three phases. We start small and prove it. Institutional adoption requires patience. The dmj.one platform gives us a live testbed.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-10">
            Go-to-Market Plan
          </h2>
          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500 via-emerald-500 to-amber-500" />
            <div className="space-y-8">
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-indigo-500/20 border-2 border-indigo-400 flex flex-col items-center justify-center z-10">
                  <span className="text-xs text-indigo-300 font-semibold">
                    NOW
                  </span>
                </div>
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5 flex-1">
                  <h3 className="text-lg font-bold text-indigo-300">
                    Phase 1 — Pilot
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    University exams via dmj.one platform. 1,000 students. Prove
                    the technology works.
                  </p>
                </div>
              </div>
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex flex-col items-center justify-center z-10">
                  <span className="text-xs text-emerald-300 font-semibold">
                    3 MO
                  </span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex-1">
                  <h3 className="text-lg font-bold text-emerald-300">
                    Phase 2 — Scale
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    5 subjects, 100K candidates. Partnership discussions with
                    exam bodies.
                  </p>
                </div>
              </div>
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex flex-col items-center justify-center z-10">
                  <span className="text-xs text-amber-300 font-semibold">
                    6 MO
                  </span>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex-1">
                  <h3 className="text-lg font-bold text-amber-300">
                    Phase 3 — NTA Integration
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Pilot integration with a low-stakes NTA exam. Prove
                    production readiness.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-8 text-base md:text-lg text-center text-slate-400 italic">
            &ldquo;Institutional adoption requires patience and proof. We have
            both.&rdquo;
          </p>
        </div>
      ),
    },

    /* ---- Slide 8: Competitive Landscape ---- */
    {
      id: 8,
      title: "Competition",
      notes:
        "Walk through the matrix column by column. NTA: zero tech. CBT: order randomization only. Proctoring: remote only. We are the only complete solution.",
      content: (
        <div className="flex flex-col justify-center h-full px-4 md:px-12 max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 text-center">
            Competitive Landscape
          </h2>
          <CompetitiveMatrix />
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto text-xs text-slate-400">
            <div>
              <span className="text-slate-300 font-semibold">NTA:</span>{" "}
              Physical security only
            </div>
            <div>
              <span className="text-slate-300 font-semibold">CBT:</span>{" "}
              Randomize order, not questions
            </div>
            <div>
              <span className="text-slate-300 font-semibold">Proctoring:</span>{" "}
              Remote only. High FPR.
            </div>
            <div>
              <span className="text-slate-300 font-semibold">Q-Banks:</span> No
              IRT calibration
            </div>
          </div>
        </div>
      ),
    },

    /* ---- Slide 9: Team ---- */
    {
      id: 9,
      title: "Team",
      notes:
        "Solo founder with working code. dmj.one is live. llm-evaluator is live. The code backs up the vision.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-10 text-center">
            Team
          </h2>
          <div className="bg-slate-800/60 rounded-2xl p-8 border border-slate-700 mx-auto max-w-2xl w-full">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-amber-500 flex items-center justify-center text-3xl font-bold text-white flex-shrink-0">
                DM
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Divya Mohan</h3>
                <p className="text-indigo-300 font-medium">Founder</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>
                    Built{" "}
                    <span className="text-white font-semibold">dmj.one</span> —
                    open-source CSE education platform
                  </p>
                  <p>
                    Built{" "}
                    <span className="text-white font-semibold">
                      llm-evaluator
                    </span>{" "}
                    — AI-powered assessment engine
                  </p>
                  <p>
                    Vision:{" "}
                    <span className="text-amber-300">
                      Aatmnirbhar Viksit Bharat 2047
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              "GCP / Gemini",
              "Cloud KMS",
              "Hyperledger Fabric",
              "GKE / Next.js",
            ].map((tech) => (
              <div
                key={tech}
                className="bg-slate-800/40 rounded-lg py-3 px-4 text-sm text-slate-300 border border-slate-700/50"
              >
                {tech}
              </div>
            ))}
          </div>
          <p className="mt-8 text-lg text-center text-amber-300 italic font-semibold">
            &ldquo;One person with a vision and the code to back it up.&rdquo;
          </p>
        </div>
      ),
    },

    /* ---- Slide 10: The Ask ---- */
    {
      id: 10,
      title: "The Ask",
      notes:
        "Three asks, then the demo link, then the closing line. Let the final quote hang in the air.",
      content: (
        <div className="flex flex-col justify-center h-full px-6 md:px-16 max-w-4xl mx-auto text-center">
          <Rocket className="h-12 w-12 md:h-16 md:w-16 text-amber-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-10">
            The Ask
          </h2>
          <div className="space-y-4 text-left max-w-2xl mx-auto">
            <div className="flex gap-3 items-start bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5">
              <Trophy className="h-6 w-6 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-indigo-300">
                  Pilot Partnerships
                </h3>
                <p className="text-sm text-slate-300">
                  With exam conducting bodies to prove production readiness
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <Users className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-emerald-300">
                  Subject Matter Experts
                </h3>
                <p className="text-sm text-slate-300">
                  For IRT-calibrated question bank creation across subjects
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-start bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
              <Shield className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-amber-300">
                  Government Collaboration
                </h3>
                <p className="text-sm text-slate-300">
                  For NTA integration and national-scale deployment
                </p>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <a
              href="https://pariksha.dmj.one"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-lg text-lg transition-colors"
            >
              Live Demo: pariksha.dmj.one
              <ExternalLink className="h-5 w-5" />
            </a>
          </div>
          <p className="mt-10 text-lg md:text-xl text-amber-300 italic font-semibold max-w-xl mx-auto leading-relaxed">
            &ldquo;300 million aspirants are waiting. Let&apos;s give them the
            exam system they deserve.&rdquo;
          </p>
        </div>
      ),
    },
  ];
}

/* ============================================================
   MAIN PITCH DECK COMPONENT
   ============================================================ */
export default function PitchDeck() {
  const slides = useSlides();
  const [current, setCurrent] = useState(0);
  const [overview, setOverview] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSlides = slides.length;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides || index === current) return;
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(index);
        setTransitioning(false);
      }, 150);
    },
    [current, totalSlides]
  );

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  /* Keyboard navigation */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (overview && e.key === "Escape") {
        setOverview(false);
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
          e.preventDefault();
          if (!overview) next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          if (!overview) prev();
          break;
        case "Escape":
        case "o":
        case "O":
          setOverview((v) => !v);
          break;
        case "n":
        case "N":
          setShowNotes((v) => !v);
          break;
        case "t":
        case "T":
          setShowTimer((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [overview, next, prev]);

  /* Timer */
  useEffect(() => {
    if (showTimer && !timerRunning) {
      setTimerRunning(true);
      setTimerSeconds(0);
    }
    if (!showTimer && timerRunning) {
      setTimerRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [showTimer, timerRunning]);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [timerRunning]);

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  /* Touch (swipe) navigation */
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  /* ---- OVERVIEW MODE ---- */
  if (overview) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 overflow-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Slide Overview
          </h2>
          <button
            onClick={() => setOverview(false)}
            className="text-sm text-slate-400 hover:text-white px-3 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Close (Esc)
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => {
                setCurrent(i);
                setOverview(false);
              }}
              className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all hover:scale-105 ${
                i === current
                  ? "border-amber-400 ring-2 ring-amber-400/50"
                  : "border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="absolute inset-0 bg-slate-900 flex items-center justify-center p-3">
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">
                    {slide.id}
                  </div>
                  <div className="text-sm font-semibold text-slate-200">
                    {slide.title}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---- SLIDE MODE ---- */
  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .slide-container {
            page-break-after: always;
            height: 100vh;
            overflow: hidden;
          }
          .print-all-slides {
            display: block !important;
          }
        }
        @media screen {
          .print-all-slides {
            display: none !important;
          }
        }
      `}</style>

      {/* On-screen presentation (single slide) */}
      <div
        className="fixed inset-0 bg-slate-900 select-none no-print"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slide content */}
        <div
          className={`absolute inset-0 transition-opacity duration-150 ${
            transitioning ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"
          }`}
        >
          {slides[current].content}
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-slate-950/90 to-transparent z-10">
          {/* Left: nav arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              disabled={current === 0}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              disabled={current === totalSlides - 1}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Center: slide counter (clickable for overview) */}
          <button
            onClick={() => setOverview(true)}
            className="text-sm font-mono text-slate-400 hover:text-amber-300 px-3 py-1 rounded transition-colors"
            title="Slide overview (O)"
          >
            {current + 1} / {totalSlides}
          </button>

          {/* Right: controls */}
          <div className="flex items-center gap-1">
            {showTimer && (
              <span
                className={`text-sm font-mono mr-2 ${
                  timerSeconds >= 1200 ? "text-red-400" : "text-slate-400"
                }`}
              >
                {formatTimer(timerSeconds)}
                {timerSeconds >= 1200 && " !"}
              </span>
            )}
            <button
              onClick={() => setShowTimer((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${
                showTimer
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-slate-500 hover:text-white hover:bg-slate-800"
              }`}
              title="Toggle timer (T)"
              aria-label="Toggle presentation timer"
            >
              <Timer className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${
                showNotes
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-slate-500 hover:text-white hover:bg-slate-800"
              }`}
              title="Toggle notes (N)"
              aria-label="Toggle presenter notes"
            >
              <StickyNote className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOverview(true)}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              title="Slide overview (O)"
              aria-label="Slide overview"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800 z-20">
          <div
            className="h-full bg-amber-400 transition-all duration-300"
            style={{
              width: `${((current + 1) / totalSlides) * 100}%`,
            }}
          />
        </div>

        {/* Presenter notes panel */}
        {showNotes && slides[current].notes && (
          <div className="absolute bottom-16 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-slate-800/95 backdrop-blur border border-slate-700 rounded-xl p-4 z-20 shadow-2xl">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Presenter Notes
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {slides[current].notes}
            </p>
          </div>
        )}

        {/* Click zones for navigation (invisible) */}
        <div
          className="absolute left-0 top-0 bottom-16 w-1/4 cursor-pointer z-[5]"
          onClick={prev}
          aria-hidden="true"
        />
        <div
          className="absolute right-0 top-0 bottom-16 w-1/4 cursor-pointer z-[5]"
          onClick={next}
          aria-hidden="true"
        />
      </div>

      {/* Print layout: all slides stacked */}
      <div className="print-all-slides">
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="slide-container bg-slate-900 relative"
            style={{ height: "100vh", width: "100vw" }}
          >
            {slide.content}
            <div className="absolute bottom-4 right-4 text-sm text-slate-500 font-mono">
              {slide.id} / {totalSlides}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
