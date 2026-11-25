'use client';

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { evaluateLandingSandbox } from '../lib/landing-sandbox';

export function HyperDropLogoMark({ className = 'size-8' }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="hd-brand-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#5B3DF5" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#hd-brand-grad)" />
      <path
        d="M18 8.5L26 12.2V18.4C26 23.1 22.6 26.8 18 28.2C13.4 26.8 10 23.1 10 18.4V12.2L18 8.5Z"
        fill="#FFFFFF"
        fillOpacity="0.18"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 18.3L17 20.8L22 15.6"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type HeroPreviewMode = 'repay' | 'dip' | 'freeze';

interface HeroProductShowcaseProps {
  readonly onOpenSimulator: () => void;
  readonly onLaunchCopilot: () => void;
}

export function HeroProductShowcase({
  onOpenSimulator,
  onLaunchCopilot,
}: HeroProductShowcaseProps) {
  const [mode, setMode] = useState<HeroPreviewMode>('repay');

  const snapshot = useMemo(() => {
    if (mode === 'dip') {
      return evaluateLandingSandbox({
        repayUsdc: 0,
        xlmDrawdownPct: 22,
        maxSingleTxUsdc: 1000,
        minHealthFactorBps: 15000,
        isPaused: false,
      });
    }
    if (mode === 'freeze') {
      return evaluateLandingSandbox({
        repayUsdc: 500,
        xlmDrawdownPct: 0,
        maxSingleTxUsdc: 1000,
        minHealthFactorBps: 15000,
        isPaused: true,
      });
    }
    return evaluateLandingSandbox({
      repayUsdc: 500,
      xlmDrawdownPct: 0,
      maxSingleTxUsdc: 1000,
      minHealthFactorBps: 15000,
      isPaused: false,
    });
  }, [mode]);

  const chartConfig = useMemo(() => {
    if (mode === 'dip') {
      return {
        path: 'M 14 48 C 44 46, 62 56, 92 64 C 122 72, 146 80, 178 82 C 206 84, 224 78, 250 72',
        area: 'M 14 48 C 44 46, 62 56, 92 64 C 122 72, 146 80, 178 82 C 206 84, 224 78, 250 72 L 250 102 L 14 102 Z',
        dotX: 178,
        dotY: 82,
        stroke: '#E11D48',
        fill: '#FFE4E6',
        callout: '1.04x Alert',
        deltaText: '-22.0% XLM dip',
        deltaTone: 'text-rose-600 bg-rose-50',
        insight:
          'XLM dropped 22%. Repaying $500 USDC restores safe loan health before liquidation.',
      };
    }
    if (mode === 'freeze') {
      return {
        path: 'M 14 54 C 52 54, 88 54, 132 54 C 176 54, 212 54, 250 54',
        area: 'M 14 54 C 52 54, 88 54, 132 54 C 176 54, 212 54, 250 54 L 250 102 L 14 102 Z',
        dotX: 178,
        dotY: 54,
        stroke: '#D97706',
        fill: '#FEF3C7',
        callout: 'Guard Frozen',
        deltaText: 'All moves paused',
        deltaTone: 'text-amber-700 bg-amber-50',
        insight:
          'Emergency Freeze is active on Soroban. Zero automated actions can run until you unfreeze.',
      };
    }
    return {
      path: 'M 14 76 C 46 72, 64 58, 94 60 C 124 62, 142 36, 176 34 C 208 32, 224 44, 250 22',
      area: 'M 14 76 C 46 72, 64 58, 94 60 C 124 62, 142 36, 176 34 C 208 32, 224 44, 250 22 L 250 102 L 14 102 Z',
      dotX: 176,
      dotY: 34,
      stroke: '#6D4AFF',
      fill: '#EDE9FE',
      callout: '1.79x Safe',
      deltaText: '+0.45x health gain',
      deltaTone: 'text-emerald-700 bg-emerald-50',
      insight:
        'Repaying $500 USDC lifts your Blend loan from 1.34x to 1.79x Safe with under $0.01 fee.',
    };
  }, [mode]);

  return (
    <div className="relative mx-auto w-full max-w-[650px] pt-4 pb-8 lg:pt-2">
      {/* Subtle Ambient Violet/Blue Aura behind the product stage */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-6 top-6 bottom-6 rounded-[40px] bg-[radial-gradient(circle_at_60%_40%,rgba(124,92,255,0.16),rgba(56,189,248,0.08)_48%,transparent_75%)]"
      />

      {/* Main Layered Stage */}
      <div className="relative grid grid-cols-1 items-center gap-5 sm:grid-cols-12">
        {/* LEFT/BACK: Elevated Overview Dashboard Card */}
        <div className="relative z-10 rounded-[26px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_24px_60px_-20px_rgba(30,27,75,0.14)] backdrop-blur-sm sm:col-span-7 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-slate-900">Overview</span>
              <span className="ml-2 text-[11px] font-medium text-slate-400">· Blend Pool</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-medium text-slate-500">Protected Collateral</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
              <span className="tabular-financial text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">
                ${Number(snapshot.collateralUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`tabular-financial rounded-md px-2 py-0.5 text-[11px] font-semibold ${chartConfig.deltaTone}`}
              >
                {chartConfig.deltaText}
              </span>
            </div>
          </div>

          {/* 3 Interactive Quick Scenario Buttons (mirrors Send / Receive / Top Up) */}
          <div className="mt-5 grid grid-cols-3 gap-2.5" role="group" aria-label="Preview loan scenarios">
            <button
              type="button"
              onClick={() => setMode('repay')}
              aria-pressed={mode === 'repay'}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] ${
                mode === 'repay'
                  ? 'border-[#6D4AFF]/40 bg-[#F5F3FF] text-[#5B3DF5] shadow-xs'
                  : 'border-slate-100 bg-slate-50/80 text-slate-600 hover:border-slate-200 hover:bg-white'
              }`}
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">Safe Repay</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('dip')}
              aria-pressed={mode === 'dip'}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] ${
                mode === 'dip'
                  ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-xs'
                  : 'border-slate-100 bg-slate-50/80 text-slate-600 hover:border-slate-200 hover:bg-white'
              }`}
            >
              <ArrowDownLeft className="size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">−22% Dip</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('freeze')}
              aria-pressed={mode === 'freeze'}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] ${
                mode === 'freeze'
                  ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-xs'
                  : 'border-slate-100 bg-slate-50/80 text-slate-600 hover:border-slate-200 hover:bg-white'
              }`}
            >
              <Lock className="size-4" aria-hidden="true" />
              <span className="whitespace-nowrap">Freeze</span>
            </button>
          </div>

          {/* Animated SVG Loan Safety Overview Chart */}
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">Loan Safety Curve</span>
              <span className="tabular-financial font-mono text-[11px] font-semibold text-slate-600">
                HF {snapshot.healthAfterDisplay}x
              </span>
            </div>

            <div className="mt-2">
              <svg
                viewBox="0 0 264 108"
                role="img"
                aria-label={`Animated loan safety chart showing ${chartConfig.callout}`}
                className="h-auto w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="hd-hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartConfig.stroke} stopOpacity="0.24" />
                    <stop offset="100%" stopColor={chartConfig.stroke} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid Hairlines */}
                {[22, 48, 74, 98].map((y) => (
                  <line
                    key={y}
                    x1="12"
                    x2="252"
                    y1={y}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray="3 4"
                    strokeWidth="1"
                  />
                ))}

                {/* Area under curve */}
                <path d={chartConfig.area} fill="url(#hd-hero-area)" />

                {/* Animated Spline Path */}
                <path
                  d={chartConfig.path}
                  fill="none"
                  stroke={chartConfig.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />

                {/* Traveling signal pulse along the safety curve */}
                <circle r="3" fill={chartConfig.stroke} opacity="0.8">
                  <animateMotion dur="4.2s" repeatCount="indefinite" path={chartConfig.path} />
                </circle>

                {/* Highlighted Callout Pill */}
                <g transform={`translate(${chartConfig.dotX}, ${chartConfig.dotY})`}>
                  <circle r="10" fill={chartConfig.stroke} opacity="0.18" className="hd-svg-pulse" />
                  <circle r="4.5" fill="#FFFFFF" stroke={chartConfig.stroke} strokeWidth="2.5" />
                  <g transform="translate(-38, -28)">
                    <rect width="76" height="20" rx="6" fill="#0F172A" />
                    <text
                      x="38"
                      y="13"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      className="font-mono text-[9px] font-semibold"
                    >
                      {chartConfig.callout}
                    </text>
                  </g>
                </g>
              </svg>
            </div>
          </div>

          {/* Floating 3D-Shaded Allocation Donut SVG Accent (bottom-left overlap like reference) */}
          <div
            aria-hidden="true"
            className="hd-float-slow pointer-events-none absolute -bottom-7 -left-7 hidden sm:block"
          >
            <svg viewBox="0 0 88 88" className="size-20">
              <defs>
                <linearGradient id="donut-v" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#818CF8" />
                  <stop offset="100%" stopColor="#5B3DF5" />
                </linearGradient>
                <linearGradient id="donut-e" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="donut-p" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F472B6" />
                  <stop offset="100%" stopColor="#DB2777" />
                </linearGradient>
                <linearGradient id="donut-a" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
              </defs>
              <g transform="rotate(-24 44 44)">
                <circle
                  cx="44"
                  cy="44"
                  r="26"
                  fill="none"
                  stroke="url(#donut-v)"
                  strokeWidth="16"
                  strokeDasharray="76 164"
                  strokeDashoffset="0"
                />
                <circle
                  cx="44"
                  cy="44"
                  r="26"
                  fill="none"
                  stroke="url(#donut-e)"
                  strokeWidth="16"
                  strokeDasharray="34 164"
                  strokeDashoffset="-78"
                />
                <circle
                  cx="44"
                  cy="44"
                  r="26"
                  fill="none"
                  stroke="url(#donut-a)"
                  strokeWidth="16"
                  strokeDasharray="24 164"
                  strokeDashoffset="-114"
                />
                <circle
                  cx="44"
                  cy="44"
                  r="26"
                  fill="none"
                  stroke="url(#donut-p)"
                  strokeWidth="16"
                  strokeDasharray="26 164"
                  strokeDashoffset="-140"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* FLOATING TOP-CENTER: AI Insight Card */}
        <div className="hd-float-delayed relative z-30 rounded-2xl border border-violet-100 bg-white/95 p-3.5 shadow-[0_18px_40px_-12px_rgba(91,61,245,0.2)] backdrop-blur-md sm:absolute sm:-top-8 sm:left-[47%] sm:w-[216px]">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-violet-100 text-[#6D4AFF]">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-slate-900">AI Risk Insight</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-600">{chartConfig.insight}</p>
          <button
            type="button"
            onClick={onOpenSimulator}
            className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6D4AFF] transition-colors hover:text-[#4F2EE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
          >
            Preview Fix
            <ArrowRight className="size-3" aria-hidden="true" />
          </button>
        </div>

        {/* RIGHT/FRONT: Sleek Tilted Smartphone Wallet Preview */}
        <div className="relative z-20 mx-auto w-full max-w-[270px] sm:col-span-5 sm:-ml-6 sm:mt-10 sm:max-w-none">
          <div className="rounded-[34px] bg-[#0F172A] p-2.5 shadow-[0_28px_65px_-16px_rgba(15,23,42,0.38)] transition-transform duration-300 lg:rotate-[3deg] lg:hover:rotate-0">
            <div className="overflow-hidden rounded-[26px] bg-white px-4 pt-3 pb-4">
              {/* Top Notch + Status */}
              <div className="mx-auto mb-3 h-4 w-20 rounded-full bg-slate-900" aria-hidden="true" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400">Freighter Connected</div>
                  <div className="text-xs font-bold text-slate-900">Stellar Wallet</div>
                </div>
                <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Bell className="size-3.5" aria-hidden="true" />
                </span>
              </div>

              {/* Vibrant Violet Guard Card (echoing Finova's purple card inside phone) */}
              <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#5B3DF5] via-[#7B5CFA] to-[#B26BFF] p-3.5 text-white shadow-[0_12px_24px_-8px_rgba(91,61,245,0.55)]">
                <div className="flex items-center justify-between text-[10px] font-semibold tracking-wide text-white/85">
                  <span>YIELDGUARD</span>
                  <span>SOROBAN</span>
                </div>
                <div className="mt-3 text-[10px] text-white/75">Loan Safety Score</div>
                <div className="tabular-financial mt-0.5 flex items-baseline justify-between">
                  <span className="text-lg font-bold tracking-tight">
                    {snapshot.healthAfterDisplay}x
                  </span>
                  <span className="text-[10.5px] font-semibold text-white/95">
                    {mode === 'freeze'
                      ? 'Frozen'
                      : snapshot.allowed
                        ? '5/5 Passed'
                        : 'Action Needed'}
                  </span>
                </div>
                <div className="tabular-financial mt-2.5 flex items-center justify-between border-t border-white/20 pt-2 text-[9.5px] text-white/85">
                  <span>Cap $1,000/tx</span>
                  <span>Floor 1.50x</span>
                </div>
              </div>

              {/* Quick Actions inside phone */}
              <div className="mt-3.5 grid grid-cols-4 gap-1.5 text-center">
                {[
                  {
                    label: 'Repay',
                    aria: 'Preview safe Blend repay',
                    icon: ArrowUpRight,
                    action: () => setMode('repay'),
                  },
                  {
                    label: 'Yield',
                    aria: 'Open DeFindex yield copilot',
                    icon: TrendingUp,
                    action: onLaunchCopilot,
                  },
                  {
                    label: 'Test',
                    aria: 'Open spending limit simulator',
                    icon: RefreshCw,
                    action: onOpenSimulator,
                  },
                  {
                    label: 'Freeze',
                    aria: 'Preview emergency freeze',
                    icon: Lock,
                    action: () => setMode('freeze'),
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      aria-label={item.aria}
                      onClick={item.action}
                      className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium text-slate-600 transition-colors hover:bg-violet-50 hover:text-[#6D4AFF]"
                    >
                      <span className="flex size-7 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Recent Protections List */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-slate-900">Recent Simulations</span>
                  <button
                    type="button"
                    onClick={onLaunchCopilot}
                    className="font-semibold text-[#6D4AFF] hover:underline"
                  >
                    Open
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-violet-100 text-[#6D4AFF]">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900">Blend Repay</div>
                        <div className="text-[9.5px] text-slate-400">Approved</div>
                      </div>
                    </div>
                    <span className="tabular-financial font-semibold text-slate-900">-$500.00</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Plus className="size-3.5" aria-hidden="true" />
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900">DeFindex USDC</div>
                        <div className="text-[9.5px] text-slate-400">Net APY</div>
                      </div>
                    </div>
                    <span className="tabular-financial font-semibold text-emerald-600">+9.57%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom 3D-shaded SVG Wallet & Stellar Coin illustration for the "How It Works" row.
 */
export function WalletIllustration3D() {
  return (
    <svg
      viewBox="0 0 220 170"
      role="img"
      aria-label="Illustration of a non-custodial digital wallet holding Stellar coins"
      className="hd-float-slow mx-auto h-auto w-full max-w-[200px]"
    >
      <defs>
        <linearGradient id="w-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="w-flap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="w-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="w-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6EE7B7" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>

      {/* Soft ground shadow */}
      <ellipse cx="116" cy="152" rx="76" ry="10" fill="#0F172A" opacity="0.08" />

      {/* Top peeking Yield Card */}
      <rect x="78" y="34" width="94" height="58" rx="14" fill="url(#w-green)" transform="rotate(6 125 63)" />

      {/* Main Wallet Body */}
      <rect x="64" y="54" width="124" height="88" rx="22" fill="url(#w-body)" />
      <rect x="64" y="54" width="124" height="36" rx="18" fill="url(#w-flap)" opacity="0.65" />

      {/* Clasp */}
      <rect x="148" y="84" width="44" height="28" rx="12" fill="#4338CA" />
      <circle cx="164" cy="98" r="5" fill="#E0E7FF" />

      {/* Floating Gold Coin Top Left */}
      <circle cx="38" cy="48" r="11" fill="url(#w-gold)" />
      <circle cx="38" cy="48" r="7" fill="none" stroke="#FFFBEB" strokeWidth="1.4" opacity="0.7" />

      {/* Front Gold Coin */}
      <circle cx="156" cy="138" r="15" fill="url(#w-gold)" />
      <circle cx="156" cy="138" r="10.5" fill="none" stroke="#FFFBEB" strokeWidth="1.6" opacity="0.75" />
      <text
        x="156"
        y="142"
        textAnchor="middle"
        fill="#92400E"
        className="font-mono text-[11px] font-bold"
      >
        $
      </text>

      {/* Small Sprout Emblem on Left */}
      <rect x="30" y="124" width="28" height="22" rx="7" fill="#E2E8F0" />
      <path d="M44 124 C44 110, 32 106, 28 112 C34 118, 40 120, 44 124 Z" fill="url(#w-green)" />
      <path d="M44 124 C44 108, 56 104, 60 110 C54 118, 48 120, 44 124 Z" fill="#059669" />
    </svg>
  );
}

/**
 * Glowing Dark-Navy Smartphone + Emerald Protection Shield SVG for the Security Banner.
 */
export function DarkSecurityPhoneSvg() {
  return (
    <svg
      viewBox="0 0 230 230"
      role="img"
      aria-label="Smartphone protected by an active on-chain security shield"
      className="h-auto w-full max-w-[220px]"
    >
      <defs>
        <radialGradient id="sec-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34D399" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#6D4AFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0B0F23" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="phone-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>
        <linearGradient id="shield-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6EE7B7" />
          <stop offset="50%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>

      {/* Radial Glow */}
      <circle cx="118" cy="118" r="96" fill="url(#sec-glow)" />

      {/* Sleek Tilted Phone Silhouette */}
      <g transform="rotate(-10 115 118)">
        <rect
          x="56"
          y="22"
          width="118"
          height="196"
          rx="26"
          fill="#131936"
          stroke="url(#phone-edge)"
          strokeWidth="3"
        />
        <rect x="96" y="34" width="38" height="6" rx="3" fill="#2A335E" />
        {/* Inner Subtle Grid Lines */}
        <line x1="74" y1="70" x2="156" y2="70" stroke="#334155" strokeOpacity="0.4" />
        <line x1="74" y1="176" x2="156" y2="176" stroke="#334155" strokeOpacity="0.4" />
      </g>

      {/* Glowing Animated Protection Shield */}
      <g transform="translate(116, 122)">
        <circle r="48" fill="#14B8A6" opacity="0.16" className="hd-svg-pulse" />
        <path
          d="M 0 -46 L 38 -30 V 4 C 38 30 20 46 0 54 C -20 46 -38 30 -38 4 V -30 L 0 -46 Z"
          fill="url(#shield-fill)"
          stroke="#CCFBF1"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M -15 3 L -4 14 L 18 -10"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hd-svg-check"
        />
      </g>

      {/* Floating Violet Orbit Badge */}
      <g className="hd-float-slow" transform="translate(182, 76)">
        <circle r="18" fill="#6D4AFF" stroke="#C4B5FD" strokeWidth="1.5" />
        <path
          d="M -5 1 L -1 5 L 6 -4"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Sleek Violet Guard Card + Dark Smartphone + Floating Coins for the Plans section.
 */
export function CardPhoneVisual3D() {
  return (
    <svg
      viewBox="0 0 240 220"
      role="img"
      aria-label="HyperDrop Stellar protection card and mobile wallet"
      className="hd-float-delayed mx-auto h-auto w-full max-w-[230px]"
    >
      <defs>
        <linearGradient id="cp-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="60%" stopColor="#6D4AFF" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="cp-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Tilted Dark Smartphone */}
      <g transform="rotate(14 146 116)">
        <rect
          x="104"
          y="34"
          width="92"
          height="164"
          rx="20"
          fill="#0F172A"
          stroke="#818CF8"
          strokeWidth="2.5"
        />
        <rect x="112" y="44" width="76" height="144" rx="14" fill="#1E1B4B" />
        <circle cx="150" cy="112" r="22" fill="#6D4AFF" opacity="0.35" />
        <path
          d="M 142 112 L 148 118 L 160 105"
          fill="none"
          stroke="#A5F3FC"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Overlapping Violet Protection Card */}
      <g transform="rotate(-8 92 108)">
        <rect x="24" y="64" width="134" height="84" rx="16" fill="url(#cp-card)" />
        <rect x="38" y="82" width="24" height="16" rx="4" fill="#FDE68A" opacity="0.9" />
        <text x="142" y="84" textAnchor="end" fill="#FFFFFF" className="font-sans text-[10px] font-bold">
          HyperDrop
        </text>
        <text x="38" y="122" fill="#E0E7FF" className="font-mono text-[9.5px]">
          5 RULES · SOROBAN
        </text>
        <text x="38" y="136" fill="#FFFFFF" className="font-mono text-[10.5px] font-semibold">
          NON-CUSTODIAL
        </text>
      </g>

      {/* Floating Gold Coins */}
      <circle cx="56" cy="46" r="12" fill="url(#cp-coin)" />
      <circle cx="186" cy="170" r="15" fill="url(#cp-coin)" />
      <circle cx="186" cy="170" r="10.5" fill="none" stroke="#FFFBEB" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

/**
 * Crisp 3D-styled Envelope SVG for the Newsletter Banner.
 */
export function NewsletterEnvelopeSvg() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="size-12 shrink-0 sm:size-14">
      <rect x="8" y="16" width="48" height="34" rx="10" fill="#FFFFFF" fillOpacity="0.95" />
      <path
        d="M12 21L32 35L52 21"
        stroke="#6D4AFF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="16" r="8" fill="#34D399" />
      <path
        d="M46.5 16.2L49 18.7L53.8 13.8"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
