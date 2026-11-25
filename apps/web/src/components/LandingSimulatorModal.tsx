'use client';

import { ArrowRight, CheckCircle2, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { evaluateLandingSandbox, type LandingSandboxInput } from '../lib/landing-sandbox';
import { Slider } from './ui/slider';

interface LandingSimulatorModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLaunchCopilot: () => void;
}

const DEFAULT_SCENARIO: LandingSandboxInput = {
  repayUsdc: 500,
  xlmDrawdownPct: 0,
  maxSingleTxUsdc: 1000,
  minHealthFactorBps: 15000,
  isPaused: false,
};

export function LandingSimulatorModal({
  open,
  onClose,
  onLaunchCopilot,
}: LandingSimulatorModalProps) {
  const [scenario, setScenario] = useState<LandingSandboxInput>(DEFAULT_SCENARIO);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const result = useMemo(() => evaluateLandingSandbox(scenario), [scenario]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulator-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_32px_80px_-16px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-xs font-semibold text-[#6D4AFF]">Interactive Soroban Simulator</p>
            <h2
              id="simulator-modal-title"
              className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
            >
              Test real Blend loan math &amp; spending limits
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sample position: 32,000 XLM deposited · $2,010 USDC borrowed on Blend Testnet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close simulator"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Controls */}
          <div className="space-y-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Repayment Amount</span>
                <span className="tabular-financial text-[#6D4AFF]">${scenario.repayUsdc} USDC</span>
              </div>
              <div className="mt-3">
                <Slider
                  aria-label="Repayment amount in USDC"
                  min={0}
                  max={1500}
                  step={50}
                  value={[scenario.repayUsdc]}
                  onValueChange={([val]) =>
                    setScenario((prev) => ({ ...prev, repayUsdc: val ?? prev.repayUsdc }))
                  }
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>XLM Price Drop</span>
                <span className="tabular-financial text-slate-900">
                  {scenario.xlmDrawdownPct === 0
                    ? `Today ($${result.xlmPriceUsd})`
                    : `−${scenario.xlmDrawdownPct}% ($${result.xlmPriceUsd})`}
                </span>
              </div>
              <div className="mt-3">
                <Slider
                  aria-label="XLM price drop percentage"
                  min={0}
                  max={40}
                  step={1}
                  value={[scenario.xlmDrawdownPct]}
                  onValueChange={([val]) =>
                    setScenario((prev) => ({
                      ...prev,
                      xlmDrawdownPct: val ?? prev.xlmDrawdownPct,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Max Single Trade Cap</span>
                <span className="tabular-financial text-slate-900">
                  ${scenario.maxSingleTxUsdc} USDC
                </span>
              </div>
              <div className="mt-3">
                <Slider
                  aria-label="Max single trade limit in USDC"
                  min={250}
                  max={2000}
                  step={50}
                  value={[scenario.maxSingleTxUsdc]}
                  onValueChange={([val]) =>
                    setScenario((prev) => ({
                      ...prev,
                      maxSingleTxUsdc: val ?? prev.maxSingleTxUsdc,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold text-slate-500">Quick Scenarios</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScenario(DEFAULT_SCENARIO)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#6D4AFF]/40 hover:bg-violet-50 hover:text-[#6D4AFF]"
                >
                  Safe Repay ($500)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScenario({
                      ...DEFAULT_SCENARIO,
                      repayUsdc: 1200,
                      maxSingleTxUsdc: 1000,
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  Over Limit ($1,200)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScenario({
                      ...DEFAULT_SCENARIO,
                      repayUsdc: 200,
                      xlmDrawdownPct: 35,
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                >
                  XLM −35% Crash
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScenario((prev) => ({
                      ...prev,
                      isPaused: !prev.isPaused,
                    }))
                  }
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    scenario.isPaused
                      ? 'border-rose-500 bg-rose-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700'
                  }`}
                >
                  <Lock className="size-3.5" aria-hidden="true" />
                  {scenario.isPaused ? 'Unfreeze' : 'Test Freeze'}
                </button>
              </div>
            </div>
          </div>

          {/* Live Output */}
          <div className="rounded-2xl border border-slate-200/80 bg-[#F8F9FD] p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div className="flex items-center gap-2.5">
                {result.allowed ? (
                  <ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="size-5 text-rose-600" aria-hidden="true" />
                )}
                <div>
                  <div className="text-[11px] font-medium text-slate-500">YieldGuard Policy</div>
                  <div
                    className={`text-sm font-bold ${
                      result.allowed ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {result.allowed
                      ? 'Allowed · All 5 Rules Passed'
                      : `Blocked · ${result.primaryErrorCode ?? 'PolicyViolation'}`}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-medium text-slate-500">Loan Health Factor</div>
                <div className="tabular-financial text-base font-bold text-slate-950">
                  {result.healthBeforeDisplay}x →{' '}
                  <span className={result.allowed ? 'text-emerald-600' : 'text-rose-600'}>
                    {result.healthAfterDisplay}x
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white p-3 shadow-xs">
                <div className="text-[11px] text-slate-500">Collateral</div>
                <div className="tabular-financial mt-0.5 text-sm font-bold text-slate-900">
                  ${result.collateralUsd}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-xs">
                <div className="text-[11px] text-slate-500">Remaining Debt</div>
                <div className="tabular-financial mt-0.5 text-sm font-bold text-slate-900">
                  ${result.debtAfterUsd}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-xs">
                <div className="text-[11px] text-slate-500">Drop Buffer</div>
                <div className="tabular-financial mt-0.5 text-sm font-bold text-emerald-700">
                  {result.dropBufferAfterPct}%
                </div>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {result.evaluation.checks.map((check) => (
                <li
                  key={check.rule}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2.5 text-xs shadow-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2
                      className={`size-4 shrink-0 ${
                        check.passed ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800">{check.label}</span>
                      <span className="tabular-financial ml-2 text-[11px] text-slate-400">
                        {check.observed} / {check.limit}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`tabular-financial shrink-0 font-semibold ${
                      check.passed ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {check.passed ? 'Passed' : check.errorCode ?? 'Blocked'}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-500">
                Every real transaction still requires your Freighter or xBull signature.
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLaunchCopilot();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7B5CFA] to-[#5B3DF5] px-4 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
              >
                Open Full Copilot
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
