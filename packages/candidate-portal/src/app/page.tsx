"use client";

import Link from "next/link";
import {
  Shield,
  CheckCircle2,
  FileSearch,
  BarChart3,
  Lock,
  Smartphone,
  Accessibility,
  Wifi,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-pariksha-600" aria-hidden="true" />
            <span className="text-xl font-bold text-pariksha-900">
              ParikshaSuraksha
            </span>
          </div>
          <nav aria-label="Main navigation" className="flex items-center gap-4">
            <Link
              href="/verify/check"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              Verify Submission
            </Link>
            <Link
              href="/exam"
              className="text-sm font-medium bg-pariksha-600 text-white px-4 py-2 rounded-md hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Start Exam
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="bg-gradient-to-br from-pariksha-50 via-white to-pariksha-50 py-20 md:py-32"
        aria-labelledby="hero-heading"
      >
        <div className="container mx-auto px-4 text-center max-w-4xl">
          <h1
            id="hero-heading"
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-pariksha-950 leading-tight"
          >
            ParikshaSuraksha
          </h1>
          <p className="mt-4 text-xl md:text-2xl text-pariksha-700 font-medium">
            Ensuring Exam Integrity for Every Aspirant
          </p>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A next-generation AI-powered exam integrity platform that ensures every
            candidate receives a fair, unique, and verifiable examination experience.
            Your responses are cryptographically secured and blockchain-verified.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/verify/check"
              className="inline-flex items-center justify-center gap-2 bg-white border-2 border-pariksha-600 text-pariksha-700 px-6 py-3 rounded-lg font-semibold hover:bg-pariksha-50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <FileSearch className="h-5 w-5" aria-hidden="true" />
              Verify Submission
            </Link>
            <Link
              href="/results/lookup"
              className="inline-flex items-center justify-center gap-2 bg-white border-2 border-pariksha-600 text-pariksha-700 px-6 py-3 rounded-lg font-semibold hover:bg-pariksha-50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              Check Results
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white" aria-labelledby="features-heading">
        <div className="container mx-auto px-4">
          <h2
            id="features-heading"
            className="text-3xl font-bold text-center text-foreground mb-12"
          >
            How ParikshaSuraksha Protects You
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <FeatureCard
              icon={<Lock className="h-8 w-8" aria-hidden="true" />}
              title="Unique Question Papers"
              description="Every candidate receives a statistically equivalent but unique question paper, preventing answer sharing."
            />
            <FeatureCard
              icon={<Shield className="h-8 w-8" aria-hidden="true" />}
              title="Blockchain Verification"
              description="Every submission is recorded on an immutable blockchain ledger. Verify your submission anytime with your hash."
            />
            <FeatureCard
              icon={<Wifi className="h-8 w-8" aria-hidden="true" />}
              title="Offline Resilient"
              description="Your responses are saved locally and sync automatically. Network issues will never cause data loss."
            />
            <FeatureCard
              icon={<Accessibility className="h-8 w-8" aria-hidden="true" />}
              title="Fully Accessible"
              description="Screen reader support, high contrast mode, large fonts, and keyboard navigation. Compliant with RPwD Act 2016."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-muted/50" aria-labelledby="how-heading">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2
            id="how-heading"
            className="text-3xl font-bold text-center text-foreground mb-12"
          >
            Your Exam Day Experience
          </h2>
          <ol className="space-y-8" role="list">
            <StepItem
              step={1}
              title="Login at Your Center"
              description="Use your admit card number and OTP to authenticate. Your center and seat assignment are verified automatically."
            />
            <StepItem
              step={2}
              title="Take Your Exam"
              description="Answer questions at your own pace. Navigate freely, mark questions for review, and use the on-screen calculator if available."
            />
            <StepItem
              step={3}
              title="Auto-Save Protection"
              description="Your responses are automatically saved every 30 seconds, both locally and to the cloud. You are always protected."
            />
            <StepItem
              step={4}
              title="Submit and Verify"
              description="On submission, you receive a unique blockchain verification hash. Use it anytime to independently verify your submission was recorded."
            />
          </ol>
        </div>
      </section>

      {/* Verification CTA */}
      <section className="py-16 bg-pariksha-600 text-white" aria-labelledby="cta-heading">
        <div className="container mx-auto px-4 text-center">
          <h2 id="cta-heading" className="text-2xl font-bold mb-4">
            Already Taken Your Exam?
          </h2>
          <p className="text-pariksha-100 mb-8 max-w-lg mx-auto">
            Verify that your submission was recorded on the blockchain using the
            hash provided at the end of your exam.
          </p>
          <Link
            href="/verify/check"
            className="inline-flex items-center gap-2 bg-white text-pariksha-700 px-6 py-3 rounded-lg font-semibold hover:bg-pariksha-50 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-pariksha-600"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Verify My Submission
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-pariksha-950 text-pariksha-200" role="contentinfo">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-pariksha-400" aria-hidden="true" />
            <span className="font-semibold text-white">ParikshaSuraksha</span>
          </div>
          <p className="text-sm text-pariksha-400">
            Ensuring exam integrity through AI, cryptography, and blockchain technology.
          </p>
          <p className="text-xs text-pariksha-500 mt-2">
            Accessible under RPwD Act 2016. WCAG 2.1 AA compliant.
          </p>
          <div className="mt-4 flex justify-center gap-6">
            <Link
              href="/verify/check"
              className="text-sm text-pariksha-300 hover:text-white transition-colors"
            >
              Verify Submission
            </Link>
            <Link
              href="/results/lookup"
              className="text-sm text-pariksha-300 hover:text-white transition-colors"
            >
              Check Results
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile-responsive indicator */}
      <div className="fixed bottom-4 right-4 md:hidden no-print">
        <Link
          href="/exam"
          className="flex items-center justify-center w-14 h-14 rounded-full bg-pariksha-600 text-white shadow-lg hover:bg-pariksha-700 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Start exam"
        >
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
      <div className="text-pariksha-600 mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-card-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StepItem({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-4 items-start">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full bg-pariksha-600 text-white flex items-center justify-center font-bold text-lg"
        aria-hidden="true"
      >
        {step}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
    </li>
  );
}
