'use client';

import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Cpu,
  Globe2,
  Layers,
  Lock,
  Play,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { validateAccessEmail } from '../lib/landing-sandbox';
import { LandingSimulatorModal } from './LandingSimulatorModal';
import {
  DarkSecurityPhoneSvg,
  HeroProductShowcase,
  HyperDropLogoMark,
  NewsletterEnvelopeSvg,
  WalletIllustration3D,
} from './LandingVisuals';

interface LandingPageProps {
  readonly onLaunchCopilot: () => void;
}

const TRUST_METRICS = [
  { value: '5 Rules', label: 'On-Chain Limits', icon: ShieldCheck },
  { value: '~$0.002', label: 'Avg Stellar Fee', icon: Sparkles },
  { value: '100%', label: 'Non-Custodial', icon: Lock },
  { value: '3 Apps', label: 'Stellar DeFi', icon: Globe2 },
  { value: '24/7', label: 'Loan Monitoring', icon: Clock },
] as const;

const FEATURES = [
  {
    title: 'AI Risk Copilot',
    description:
      'Monitors your Blend loans around the clock and flags liquidation risk early with clear numbers.',
    icon: Cpu,
    tileBg: 'bg-[#EAF3FF] text-[#2563EB]',
  },
  {
    title: 'Exact Repay Previews',
    description:
      'See exact balance diffs, new health factor, and tiny Stellar fees before signing a single tap.',
    icon: BarChart3,
    tileBg: 'bg-[#FFF0E6] text-[#EA580C]',
  },
  {
    title: 'Hard Spending Caps',
    description:
      'Per-trade limits, 24-hour caps, and approved apps are enforced directly on Soroban.',
    icon: SlidersHorizontal,
    tileBg: 'bg-[#F1ECFF] text-[#6D4AFF]',
  },
  {
    title: 'Best USDC Yields',
    description:
      'Compare live DeFindex vaults with network fees already deducted so idle USDC earns smarter.',
    icon: TrendingUp,
    tileBg: 'bg-[#FFEAF5] text-[#DB2777]',
  },
] as const;

const WORKFLOW_STEPS = [
  {
    number: '01',
    title: 'Connect Wallet',
    description: 'Link Freighter or xBull in seconds. Your secret keys never leave your device.',
    icon: Wallet,
  },
  {
    number: '02',
    title: 'Set Your Limits',
    description: 'Choose your max per trade, 24-hour cap, and minimum loan safety line.',
    icon: SlidersHorizontal,
  },
  {
    number: '03',
    title: 'Preview & Simulate',
    description: 'Review exact Blend or DeFindex balance changes and Stellar fees upfront.',
    icon: Shield,
  },
  {
    number: '04',
    title: 'Approve & Earn',
    description: 'Sign in one tap to keep loans safe and put idle USDC to work automatically.',
    icon: TrendingUp,
  },
] as const;

const USER_STORIES = [
  {
    quote:
      '"When XLM slid 18% overnight, HyperDrop prepared the exact $450 Blend repayment so I woke up with a 1.76x health factor and zero forced sell-offs."',
    name: 'Amara Okafor',
    role: 'Stellar Liquidity Provider',
    initials: 'AO',
    avatarTone: 'bg-violet-100 text-violet-700',
  },
  {
    quote:
      '"I refuse to hand over private keys. Having a $1,000 per-trade cap and a 1-tap Freeze button directly on Soroban finally made AI DeFi usable."',
    name: 'Daniel Lindholm',
    role: 'Independent Treasury Manager',
    initials: 'DL',
    avatarTone: 'bg-sky-100 text-sky-700',
  },
  {
    quote:
      '"Comparing DeFindex Balanced against single-asset USDC after Soroban fees saved me hours of spreadsheets and lifted my net yield immediately."',
    name: 'Priya Nair',
    role: 'DeFi Analyst · Stellar Ecosystem',
    initials: 'PN',
    avatarTone: 'bg-emerald-100 text-emerald-700',
  },
] as const;

export function LandingPage({ onLaunchCopilot }: LandingPageProps) {
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [subscribedEmail, setSubscribedEmail] = useState<string | null>(null);

  const handleSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const check = validateAccessEmail(email);
    if (!check.valid) {
      setEmailError(check.error ?? 'Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubscribedEmail(check.normalized);
    setEmail('');
    toast.success('You are on the Stellar Mainnet launch list', {
      description: `We will message ${check.normalized} as soon as Mainnet opens.`,
    });
  };

  return (
    <div id="top" className="min-h-screen bg-[#F7F8FC] font-sans text-[#0F172A] antialiased">
      {/* ====================================================================
          TOP NAVIGATION BAR (Clean 3-Zone Contract)
      ==================================================================== */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-6 sm:px-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="inline-flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
          >
            <HyperDropLogoMark className="size-8" />
            <span>HyperDrop</span>
          </a>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex"
          >
            <a
              href="#features"
              className="whitespace-nowrap transition-colors hover:text-[#6D4AFF]"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="whitespace-nowrap transition-colors hover:text-[#6D4AFF]"
            >
              How It Works
            </a>
            <a
              href="#security"
              className="whitespace-nowrap transition-colors hover:text-[#6D4AFF]"
            >
              Security
            </a>
            <a
              href="#newsletter"
              className="whitespace-nowrap transition-colors hover:text-[#6D4AFF]"
            >
              Updates
            </a>
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <button
            type="button"
            onClick={onLaunchCopilot}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#7B5CFA] to-[#5B3DF5] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_rgba(91,61,245,0.55)] transition-opacity duration-200 hover:opacity-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2"
          >
            Open App
          </button>
        </div>
      </header>

      <main>
        {/* ====================================================================
            HERO SECTION (Crisp Airy Canvas + Animated Layered Showcase)
        ==================================================================== */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white via-[#FAF9FF] to-[#F7F8FC] pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
              {/* Left Copy Column */}
              <div className="space-y-6 lg:col-span-5">
                <div className="hd-hero-in flex items-center gap-2 text-xs font-semibold text-[#6D4AFF]">
                  <span>AI-Powered Stellar Copilot</span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="text-slate-500">Non-Custodial</span>
                </div>

                <h1
                  style={{ animationDelay: '70ms' }}
                  className="hd-hero-in text-[clamp(2.45rem,4.4vw,3.75rem)] leading-[1.08] font-bold tracking-[-0.03em] text-slate-950"
                >
                  Protect Stellar Loans{' '}
                  <span className="bg-gradient-to-r from-[#7B5CFA] to-[#5B3DF5] bg-clip-text text-transparent">
                    Smartly.
                  </span>{' '}
                  Earn Better.
                </h1>

                <p
                  style={{ animationDelay: '140ms' }}
                  className="hd-hero-in max-w-[44ch] text-base leading-relaxed text-slate-600 sm:text-[17px]"
                >
                  All-in-one non-custodial Stellar app to monitor Blend loans, compare DeFindex
                  USDC yields, and approve exact repayments with built-in spending caps.
                </p>

                <div
                  style={{ animationDelay: '210ms' }}
                  className="hd-hero-in flex flex-wrap items-center gap-3.5 pt-1"
                >
                  <button
                    type="button"
                    onClick={onLaunchCopilot}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7B5CFA] to-[#5B3DF5] px-6 text-sm font-semibold text-white shadow-[0_14px_28px_-8px_rgba(91,61,245,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2"
                  >
                    Launch Free on Testnet
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorOpen(true)}
                    className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-xs transition-colors duration-200 hover:border-[#6D4AFF]/40 hover:text-[#6D4AFF] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
                  >
                    <Play className="size-3.5 fill-current" aria-hidden="true" />
                    Try Live Simulator
                  </button>
                </div>

                {/* Clean Social / Ecosystem Proof Strip */}
                <div
                  style={{ animationDelay: '280ms' }}
                  className="hd-hero-in flex items-center gap-3.5 pt-2"
                >
                  <div className="flex -space-x-2" aria-hidden="true">
                    {[
                      { code: 'BL', bg: 'bg-[#5B3DF5] text-white' },
                      { code: 'DF', bg: 'bg-emerald-600 text-white' },
                      { code: 'SW', bg: 'bg-sky-600 text-white' },
                      { code: 'FR', bg: 'bg-slate-900 text-white' },
                    ].map((badge) => (
                      <span
                        key={badge.code}
                        className={`flex size-9 items-center justify-center rounded-full border-2 border-white font-mono text-[10px] font-bold shadow-xs ${badge.bg}`}
                      >
                        {badge.code}
                      </span>
                    ))}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Built for Freighter &amp; xBull
                    </div>
                    <div className="text-xs text-slate-500">
                      Open-source Soroban YieldGuard · Zero key custody
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Layered Product Showcase */}
              <div style={{ animationDelay: '150ms' }} className="hd-hero-in lg:col-span-7">
                <HeroProductShowcase
                  onOpenSimulator={() => setSimulatorOpen(true)}
                  onLaunchCopilot={onLaunchCopilot}
                />
              </div>
            </div>

            {/* ================================================================
                FLOATING 5-COLUMN METRICS BAR (Matches Finova White Metric Bar)
            ================================================================ */}
            <div className="mt-14 rounded-3xl border border-slate-200/80 bg-white px-6 py-5 shadow-[0_14px_40px_-14px_rgba(15,23,42,0.08)] sm:px-8">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
                {TRUST_METRICS.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className="flex items-center gap-3.5">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#F1ECFF] text-[#6D4AFF]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="tabular-financial text-lg font-bold tracking-tight text-slate-950">
                          {metric.value}
                        </div>
                        <div className="truncate text-xs text-slate-500">{metric.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            FEATURES SECTION (Left Intro + 4 Pastel-Icon White Cards)
        ==================================================================== */}
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
              <div className="lg:col-span-3 lg:pt-2">
                <p className="text-xs font-semibold tracking-wide text-[#6D4AFF]">Features</p>
                <h2
                  id="features-heading"
                  className="mt-2 text-3xl leading-[1.15] font-bold tracking-[-0.025em] text-slate-950"
                >
                  Everything You Need in{' '}
                  <span className="text-[#6D4AFF]">One Stellar App</span>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Real deterministic math for your loans and yields—never AI guesses.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-9 lg:grid-cols-4">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-1"
                    >
                      <span
                        className={`flex size-11 items-center justify-center rounded-xl ${feature.tileBg}`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="mt-5 text-base font-bold tracking-tight text-slate-950">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            HOW IT WORKS SECTION (4 Connected Steps + 3D Wallet Illustration)
        ==================================================================== */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="scroll-mt-16 border-y border-slate-200/60 bg-white py-20"
        >
          <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold tracking-wide text-[#6D4AFF]">How It Works</p>
                <h2
                  id="how-heading"
                  className="mt-2 text-3xl leading-[1.15] font-bold tracking-[-0.025em] text-slate-950"
                >
                  Simple Steps to{' '}
                  <span className="text-[#6D4AFF]">Safer Stellar DeFi</span>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Go from wallet connect to protected Blend loans in under two minutes.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-4">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isActive = idx === activeStep;
                  return (
                    <div key={step.number} className="relative flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setActiveStep(idx)}
                        aria-pressed={isActive}
                        className={`flex w-full flex-col items-start rounded-2xl border p-5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] ${
                          isActive
                            ? 'border-[#6D4AFF]/50 bg-[#FAF8FF] shadow-[0_12px_28px_-12px_rgba(91,61,245,0.22)]'
                            : 'border-slate-200/80 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="tabular-financial text-xs font-bold text-[#6D4AFF]">
                            {step.number}
                          </span>
                          <span className="flex size-9 items-center justify-center rounded-xl bg-[#F1ECFF] text-[#6D4AFF]">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                        </div>
                        <h3 className="mt-4 text-sm font-bold text-slate-950">{step.title}</h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          {step.description}
                        </p>
                      </button>

                      {idx < WORKFLOW_STEPS.length - 1 && (
                        <ArrowRight
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 text-slate-400 lg:block"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="lg:col-span-2">
                <WalletIllustration3D />
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            DARK SECURITY SHOWCASE + TRUSTED USER STORIES (Exact Finova Split)
        ==================================================================== */}
        <section id="security" aria-labelledby="security-heading" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-[1200px] px-6 sm:px-8">
            <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
              {/* Left Dark Midnight Security Card */}
              <div className="relative overflow-hidden rounded-[28px] bg-[#0A0D1E] p-7 text-white shadow-[0_24px_60px_-18px_rgba(10,13,30,0.45)] sm:p-8 lg:col-span-5">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(109,74,255,0.34),transparent_70%)]"
                />
                <div className="relative grid grid-cols-1 items-center gap-6 sm:grid-cols-12">
                  <div className="space-y-4 sm:col-span-7">
                    <h2
                      id="security-heading"
                      className="text-2xl leading-[1.16] font-bold tracking-[-0.02em] text-white sm:text-[28px]"
                    >
                      Take Control of Your Stellar Safety
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-300">
                      Every spending cap and allowed app lives on Soroban—plus a 1-tap Emergency
                      Freeze button anytime you want to pause.
                    </p>
                    <button
                      type="button"
                      onClick={onLaunchCopilot}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7B5CFA] to-[#5B3DF5] px-5 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      Open Copilot Now
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex justify-center sm:col-span-5">
                    <DarkSecurityPhoneSvg />
                  </div>
                </div>

                {/* Floating Bottom White Security Bar (mirrors Bank-Level Security pill) */}
                <button
                  type="button"
                  onClick={() => setSimulatorOpen(true)}
                  className="relative mt-6 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-slate-900 shadow-lg transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7B5CFA]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-[#F1ECFF] text-[#6D4AFF]">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-950">
                        On-Chain Soroban Guardrails
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Click to test all 5 spending limits live
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              </div>

              {/* Right Testimonials Column */}
              <div className="flex flex-col justify-between lg:col-span-7">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-[#6D4AFF]">
                      Real Outcomes
                    </p>
                    <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-3xl">
                      Trusted by Everyday Stellar Users
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimulatorOpen(true)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-[#6D4AFF]/40 hover:text-[#6D4AFF] whitespace-nowrap"
                  >
                    Try Simulator
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {USER_STORIES.map((story) => (
                    <article
                      key={story.name}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,23,42,0.06)]"
                    >
                      <div>
                        <div className="flex items-center gap-0.5 text-amber-400" aria-label="5 out of 5 stars">
                          {[0, 1, 2, 3, 4].map((star) => (
                            <Star key={star} className="size-3.5 fill-current" aria-hidden="true" />
                          ))}
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-slate-600">{story.quote}</p>
                      </div>

                      <div className="mt-5 flex items-center gap-2.5 border-t border-slate-100 pt-3.5">
                        <span
                          aria-hidden="true"
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${story.avatarTone}`}
                        >
                          {story.initials}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-950">
                            {story.name}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">{story.role}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            VIOLET NEWSLETTER BANNER + DEEP MIDNIGHT FOOTER
        ==================================================================== */}
        <section id="newsletter" aria-labelledby="newsletter-heading" className="bg-[#F7F8FC] pt-4">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <div className="rounded-t-[28px] bg-gradient-to-r from-[#5B5BF7] via-[#7B5CFA] to-[#9333EA] px-6 py-8 text-white shadow-[0_20px_50px_-15px_rgba(91,61,245,0.45)] sm:px-10 sm:py-9">
              <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                  <NewsletterEnvelopeSvg />
                  <div>
                    <h2
                      id="newsletter-heading"
                      className="text-xl font-bold tracking-tight text-white sm:text-2xl"
                    >
                      Stay Updated with HyperDrop
                    </h2>
                    <p className="mt-1 text-sm text-white/85">
                      Get notified the day Stellar Mainnet protection and new DeFindex vaults open.
                    </p>
                  </div>
                </div>

                {subscribedEmail ? (
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white/15 px-4 py-3 text-sm font-medium text-white backdrop-blur-xs">
                    <Check className="size-4 text-emerald-300" aria-hidden="true" />
                    <span>Subscribed {subscribedEmail} for Stellar Mainnet launch alerts.</span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubscribe}
                    noValidate
                    className="w-full max-w-md space-y-2"
                  >
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <label htmlFor="newsletter-email" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="newsletter-email"
                        type="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (emailError) setEmailError(null);
                        }}
                        placeholder="Enter your email address"
                        aria-invalid={Boolean(emailError)}
                        className="h-11 flex-1 rounded-xl border border-white/25 bg-white/15 px-4 text-sm text-white placeholder:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-[#5B3DF5] shadow-sm transition-colors hover:bg-violet-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        Subscribe
                      </button>
                    </div>
                    {emailError && (
                      <p role="alert" className="text-xs font-medium text-rose-100">
                        {emailError}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Connected Midnight Navy Footer */}
          <footer className="bg-[#0A0D1E] text-slate-300">
            <div className="mx-auto max-w-[1200px] px-6 pt-14 pb-10 sm:px-8">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12">
                {/* Brand Summary */}
                <div className="lg:col-span-4">
                  <div className="inline-flex items-center gap-2.5 text-lg font-bold text-white">
                    <HyperDropLogoMark className="size-8" />
                    <span>HyperDrop</span>
                  </div>
                  <p className="mt-4 max-w-[30ch] text-xs leading-relaxed text-slate-400">
                    Open-source, non-custodial AI DeFi copilot helping Stellar users keep Blend
                    loans safe and grow idle USDC smarter.
                  </p>
                </div>

                {/* Links Column 1 */}
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-bold text-white">Product</h3>
                  <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
                    <li>
                      <a href="#features" className="transition-colors hover:text-white">
                        Features
                      </a>
                    </li>
                    <li>
                      <a href="#how-it-works" className="transition-colors hover:text-white">
                        How It Works
                      </a>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setSimulatorOpen(true)}
                        className="transition-colors hover:text-white"
                      >
                        Live Simulator
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Links Column 2 */}
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-bold text-white">Protocols</h3>
                  <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
                    <li>
                      <button
                        type="button"
                        onClick={onLaunchCopilot}
                        className="transition-colors hover:text-white"
                      >
                        Blend Lending
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={onLaunchCopilot}
                        className="transition-colors hover:text-white"
                      >
                        DeFindex Vaults
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={onLaunchCopilot}
                        className="transition-colors hover:text-white"
                      >
                        Soroswap Routing
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Links Column 3 */}
                <div className="lg:col-span-1">
                  <h3 className="text-xs font-bold text-white">Safety</h3>
                  <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
                    <li>
                      <a href="#security" className="transition-colors hover:text-white">
                        YieldGuard
                      </a>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setSimulatorOpen(true)}
                        className="transition-colors hover:text-white"
                      >
                        Spending Caps
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={onLaunchCopilot}
                        className="transition-colors hover:text-white"
                      >
                        Testnet App
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Supported Wallets Cards (echoes the dark store buttons in the reference) */}
                <div className="lg:col-span-3">
                  <h3 className="text-xs font-bold text-white">Connect on Stellar</h3>
                  <div className="mt-3.5 space-y-2.5">
                    <button
                      type="button"
                      onClick={onLaunchCopilot}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-left transition-colors hover:border-[#7B5CFA]/60 hover:bg-white/10"
                    >
                      <Wallet className="size-5 shrink-0 text-[#A78BFA]" aria-hidden="true" />
                      <div>
                        <div className="text-[10px] text-slate-400">Connect with</div>
                        <div className="text-xs font-bold text-white">Freighter Wallet</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onLaunchCopilot}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-left transition-colors hover:border-[#7B5CFA]/60 hover:bg-white/10"
                    >
                      <Layers className="size-5 shrink-0 text-[#6EE7B7]" aria-hidden="true" />
                      <div>
                        <div className="text-[10px] text-slate-400">Connect with</div>
                        <div className="text-xs font-bold text-white">xBull Wallet</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
                <div>© 2026 HyperDrop · Built for Stellar Testnet &amp; Soroban</div>
                <div className="flex items-center gap-6">
                  <a href="#security" className="transition-colors hover:text-slate-300">
                    Non-Custodial Policy
                  </a>
                  <a href="#features" className="transition-colors hover:text-slate-300">
                    Open-Source License
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </section>
      </main>

      <LandingSimulatorModal
        open={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        onLaunchCopilot={onLaunchCopilot}
      />
    </div>
  );
}
