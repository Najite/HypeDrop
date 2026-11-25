'use client';

import * as React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import type {
  DeFindexYieldComparison,
  HealthRiskBand,
  PortfolioHealthSnapshot,
  YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';
import {
  buildPortfolioSafetyPoints,
  computeDashboardSummary,
} from '../lib/dashboard-metrics';
import {
  cn,
  formatBpsAsPercent,
  formatDecimalWithCommas,
} from '../lib/utils';
import { Button } from './ui/button';

export interface DashboardOverviewProps {
  readonly snapshot: PortfolioHealthSnapshot | null;
  readonly policy: YieldGuardPolicy;
  readonly yieldComparison: DeFindexYieldComparison | null;
  readonly recommendedRepayUsdc: string;
  readonly isLoading: boolean;
  readonly isBusy: boolean;
  readonly onRefresh: () => void;
  readonly onSimulateRepay: (amount?: string) => void;
  readonly onSimulateDeFindex: (amount?: string, vaultName?: string) => void;
  readonly onCompareYields: () => void;
  readonly onOpenGuardrails: () => void;
}

function bandTextClass(band: HealthRiskBand): string {
  if (band === 'safe') return 'text-risk-safe';
  if (band === 'caution') return 'text-risk-caution';
  return 'text-risk-danger';
}

function bandBgClass(band: HealthRiskBand): string {
  if (band === 'safe') return 'bg-risk-safe';
  if (band === 'caution') return 'bg-risk-caution';
  return 'bg-risk-danger';
}

function bandStrokeColor(band: HealthRiskBand): string {
  if (band === 'safe') return '#059669';
  if (band === 'caution') return '#D97706';
  return '#E11D48';
}

function bandLabel(band: HealthRiskBand): string {
  if (band === 'safe') return 'Safe zone';
  if (band === 'caution') return 'Caution zone';
  return 'Liquidation danger';
}

export function DashboardOverview({
  snapshot,
  policy,
  yieldComparison,
  recommendedRepayUsdc,
  isLoading,
  isBusy,
  onRefresh,
  onSimulateRepay,
  onSimulateDeFindex,
  onCompareYields,
  onOpenGuardrails,
}: DashboardOverviewProps) {
  const [selectedShock, setSelectedShock] = React.useState<number>(0);

  const summary = React.useMemo(
    () => computeDashboardSummary(snapshot, policy, recommendedRepayUsdc),
    [snapshot, policy, recommendedRepayUsdc],
  );

  const safetyPoints = React.useMemo(
    () => buildPortfolioSafetyPoints(snapshot, 500),
    [snapshot],
  );

  const activePoint =
    safetyPoints.find((p) => p.shockPct === selectedShock) ?? safetyPoints[3];

  // SVG coordinate projection for the Loan Safety Curve (viewBox 0 0 560 156)
  const chart = React.useMemo(() => {
    const minY = 0.7;
    const maxY = 2.6;
    const left = 34;
    const right = 540;
    const top = 16;
    const bottom = 128;

    const toX = (index: number) =>
      left + (index / Math.max(1, safetyPoints.length - 1)) * (right - left);
    const toY = (hf: number) => {
      const clamped = Math.max(minY, Math.min(maxY, hf));
      const ratio = (clamped - minY) / (maxY - minY);
      return bottom - ratio * (bottom - top);
    };

    const currentCoords = safetyPoints.map((p, idx) => ({
      x: toX(idx),
      y: toY(p.currentHf),
      point: p,
    }));
    const projectedCoords = safetyPoints.map((p, idx) => ({
      x: toX(idx),
      y: toY(p.projectedHf),
      point: p,
    }));

    const buildSmoothPath = (coords: readonly { x: number; y: number }[]) => {
      if (coords.length === 0) return '';
      return coords.reduce((acc, pt, idx) => {
        if (idx === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        const prev = coords[idx - 1];
        const midX = ((prev.x + pt.x) / 2).toFixed(1);
        return `${acc} C ${midX} ${prev.y.toFixed(1)}, ${midX} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }, '');
    };

    const currentPath = buildSmoothPath(currentCoords);
    const projectedPath = buildSmoothPath(projectedCoords);
    const projectedArea =
      projectedCoords.length > 0
        ? `${projectedPath} L ${projectedCoords[projectedCoords.length - 1].x.toFixed(1)} ${bottom} L ${projectedCoords[0].x.toFixed(1)} ${bottom} Z`
        : '';

    const activeIdx = Math.max(
      0,
      safetyPoints.findIndex((p) => p.shockPct === selectedShock),
    );

    return {
      left,
      right,
      top,
      bottom,
      ySafe: toY(1.5),
      yLiq: toY(1.0),
      currentCoords,
      projectedCoords,
      currentPath,
      projectedPath,
      projectedArea,
      activeCurrent: currentCoords[activeIdx] ?? currentCoords[0],
      activeProjected: projectedCoords[activeIdx] ?? projectedCoords[0],
    };
  }, [safetyPoints, selectedShock]);

  const repayNeeded = snapshot ? snapshot.riskBand !== 'safe' : true;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {/* Frozen Policy Banner */}
      {policy.isPaused && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-risk-danger-border bg-risk-danger-surface px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2.5 text-risk-danger">
            <ShieldOff className="size-4 shrink-0" />
            <span className="font-medium">
              Emergency Freeze is active on YieldGuardPolicy. All agent actions are blocked until
              you unfreeze.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenGuardrails}
            className="min-h-9 border-risk-danger-border bg-card text-foreground"
          >
            Manage Freeze
          </Button>
        </div>
      )}

      {/* Card 1: Portfolio Overview & Interactive Loan Safety Curve (Hero Counterpart) */}
      <section
        aria-label="Portfolio Overview and Loan Safety Curve"
        className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Net Stellar Equity</span>
              <span aria-hidden="true">·</span>
              <span>Blend v2 Pool</span>
            </div>
            {snapshot ? (
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="tabular-financial text-3xl sm:text-[34px] font-bold tracking-tight text-foreground">
                  ${formatDecimalWithCommas(summary.netEquityUsd)}
                </h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-financial">
                  <span>Collateral ${formatDecimalWithCommas(summary.totalCollateralUsd)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Debt ${formatDecimalWithCommas(summary.totalDebtUsd)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 h-9 w-52 animate-pulse rounded-lg bg-secondary" />
            )}
          </div>

          <div className="flex items-center gap-3">
            {snapshot && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Blend Health Factor</div>
                <div className="mt-0.5 flex items-baseline justify-end gap-2">
                  <span
                    data-testid="overview-health-factor"
                    className={cn(
                      'tabular-financial text-2xl font-bold tracking-tight',
                      bandTextClass(snapshot.riskBand),
                    )}
                  >
                    {snapshot.healthFactorFormatted}x
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      bandTextClass(snapshot.riskBand),
                    )}
                  >
                    {bandLabel(snapshot.riskBand)}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh Blend portfolio health"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface-inset text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* One-Tap Quick Actions Row (Mirrors Landing Page Hero Overview Actions) */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onSimulateRepay('500.00')}
            className={cn(
              'flex min-h-[54px] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer',
              repayNeeded && !policy.isPaused
                ? 'border-primary/25 bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border-border bg-surface-inset text-foreground hover:bg-accent',
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                repayNeeded && !policy.isPaused
                  ? 'bg-white/18 text-white'
                  : 'bg-[#F1ECFF] text-[#6D4AFF] dark:bg-violet-500/15 dark:text-violet-300',
              )}
            >
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Repay 500 USDC</div>
              <div
                className={cn(
                  'truncate text-[11px]',
                  repayNeeded && !policy.isPaused
                    ? 'text-white/80'
                    : 'text-muted-foreground',
                )}
              >
                Lift loan safety
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onCompareYields}
            className="flex min-h-[54px] items-center gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-foreground transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF3FF] text-[#2563EB] dark:bg-sky-500/15 dark:text-sky-300">
              <TrendingUp className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Compare Yields</div>
              <div className="truncate text-[11px] text-muted-foreground">
                DeFindex net APY
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onSimulateDeFindex('800.00')}
            className="flex min-h-[54px] items-center gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-foreground transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#059669] dark:bg-emerald-500/15 dark:text-emerald-300">
              <ArrowDownLeft className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Earn 800 USDC</div>
              <div className="truncate text-[11px] text-muted-foreground">
                Auto-compound
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenGuardrails}
            className="flex min-h-[54px] items-center gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-foreground transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0E6] text-[#EA580C] dark:bg-amber-500/15 dark:text-amber-300">
              <SlidersHorizontal className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Edit Limits</div>
              <div className="truncate text-[11px] text-muted-foreground">
                Soroban caps
              </div>
            </div>
          </button>
        </div>

        {/* Interactive Loan Safety Curve */}
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Loan Safety Curve across XLM price moves
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compare your current Health Factor against a 500 USDC Blend repayment before
                signing.
              </p>
            </div>

            {/* Interactive Market Move Scenario Selector */}
            <div
              role="group"
              aria-label="Select XLM price shock scenario"
              className="flex items-center gap-1 rounded-xl bg-surface-inset p-1"
            >
              {[
                { shock: 0, label: 'Spot' },
                { shock: -10, label: '-10%' },
                { shock: -20, label: '-20%' },
                { shock: -30, label: '-30%' },
              ].map((opt) => (
                <button
                  key={opt.shock}
                  type="button"
                  onClick={() => setSelectedShock(opt.shock)}
                  className={cn(
                    'min-h-8 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer',
                    selectedShock === opt.shock
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Canvas */}
          <div className="mt-4 rounded-xl bg-surface-inset/75 px-3 pt-3 pb-2">
            <svg
              viewBox="0 0 560 156"
              className="h-[156px] w-full overflow-visible"
              role="img"
              aria-label="Loan Safety Curve comparing current and projected Blend Health Factor"
            >
              <defs>
                <linearGradient id="hd-dash-projected-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6D4AFF" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#6D4AFF" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Safe 1.50x Reference Line */}
              <line
                x1={chart.left}
                y1={chart.ySafe}
                x2={chart.right}
                y2={chart.ySafe}
                stroke="#059669"
                strokeOpacity="0.38"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={chart.left - 4}
                y={chart.ySafe + 3}
                textAnchor="end"
                className="fill-risk-safe text-[9.5px] font-mono"
              >
                1.5x
              </text>

              {/* Liquidation 1.00x Reference Line */}
              <line
                x1={chart.left}
                y1={chart.yLiq}
                x2={chart.right}
                y2={chart.yLiq}
                stroke="#E11D48"
                strokeOpacity="0.4"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <text
                x={chart.left - 4}
                y={chart.yLiq + 3}
                textAnchor="end"
                className="fill-risk-danger text-[9.5px] font-mono"
              >
                1.0x
              </text>

              {/* Projected Post-Repay Area & Curve */}
              <path d={chart.projectedArea} fill="url(#hd-dash-projected-area)" />
              <path
                d={chart.projectedPath}
                fill="none"
                stroke="#6D4AFF"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Current Baseline Curve */}
              <path
                d={chart.currentPath}
                fill="none"
                stroke={snapshot ? bandStrokeColor(snapshot.riskBand) : '#D97706'}
                strokeWidth="2"
                strokeDasharray="5 4"
                strokeLinecap="round"
              />

              {/* Active vertical guide */}
              {chart.activeProjected && (
                <line
                  x1={chart.activeProjected.x}
                  y1={chart.top}
                  x2={chart.activeProjected.x}
                  y2={chart.bottom}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth="1"
                />
              )}

              {/* Active Scenario Markers */}
              {chart.activeCurrent && (
                <circle
                  cx={chart.activeCurrent.x}
                  cy={chart.activeCurrent.y}
                  r="4.5"
                  fill={bandStrokeColor(activePoint.currentBand)}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              )}
              {chart.activeProjected && (
                <circle
                  cx={chart.activeProjected.x}
                  cy={chart.activeProjected.y}
                  r="5"
                  fill="#6D4AFF"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              )}

              {/* X-Axis Labels */}
              {chart.currentCoords.map((coord) => (
                <text
                  key={coord.point.shockPct}
                  x={coord.x}
                  y={146}
                  textAnchor="middle"
                  className={cn(
                    'text-[10px] font-mono',
                    coord.point.shockPct === selectedShock
                      ? 'fill-foreground font-semibold'
                      : 'fill-muted-foreground',
                  )}
                >
                  {coord.point.label}
                </text>
              ))}
            </svg>
          </div>

          {/* Scenario Readout Footer */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn('h-0.5 w-4 rounded-full', bandBgClass(activePoint.currentBand))}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">Current ({activePoint.label}):</span>
                <span
                  className={cn(
                    'tabular-financial font-semibold',
                    bandTextClass(activePoint.currentBand),
                  )}
                >
                  {activePoint.currentHf.toFixed(2)}x
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden="true" />
                <span className="text-muted-foreground">After $500 Repay:</span>
                <span
                  className={cn(
                    'tabular-financial font-semibold',
                    bandTextClass(activePoint.projectedBand),
                  )}
                >
                  {activePoint.projectedHf.toFixed(2)}x
                </span>
              </div>
            </div>

            {snapshot && (
              <div className="tabular-financial text-muted-foreground">
                Liquidation cushion:{' '}
                <span className="font-semibold text-foreground">
                  -{snapshot.liquidationPriceDropPct}% XLM drop
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Row 2: Active Blend Positions + Midnight Navy YieldGuard Card */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Active Blend Positions Card */}
        <section
          aria-label="Active Blend Positions"
          className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Active Blend Positions</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Live collateral and borrowed debt tracked on Stellar Testnet
                </p>
              </div>
              <span className="tabular-financial text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {snapshot ? `${snapshot.positions.length} positions` : 'Syncing…'}
              </span>
            </div>

            {snapshot ? (
              <div className="mt-4 divide-y divide-border">
                {snapshot.positions.map((pos) => {
                  const isDebt = Number(pos.debtUsd) > 0;
                  return (
                    <div
                      key={`${pos.poolId}-${pos.asset.code}`}
                      className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-xl',
                            isDebt
                              ? 'bg-risk-danger-surface text-risk-danger'
                              : 'bg-risk-safe-surface text-risk-safe',
                          )}
                        >
                          {isDebt ? (
                            <ArrowUpRight className="size-4" />
                          ) : (
                            <ArrowDownLeft className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <span>{pos.asset.symbol}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {isDebt ? 'Borrowed Debt' : 'Collateral'}
                            </span>
                          </div>
                          <div className="mt-0.5 tabular-financial text-xs text-muted-foreground">
                            {isDebt
                              ? `${formatBpsAsPercent(pos.borrowApyBps)} borrow APY`
                              : `${formatBpsAsPercent(pos.supplyApyBps)} supply APY`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="tabular-financial text-sm font-semibold text-foreground">
                            ${formatDecimalWithCommas(isDebt ? pos.debtUsd : pos.collateralUsd)}
                          </div>
                          <div className="tabular-financial text-xs text-muted-foreground">
                            {formatDecimalWithCommas(
                              isDebt ? pos.debtFormatted : pos.collateralFormatted,
                            )}{' '}
                            {pos.asset.symbol}
                          </div>
                        </div>
                        {isDebt && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => onSimulateRepay('500.00')}
                            className="min-h-8 h-8 px-2.5 text-xs"
                          >
                            Repay
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <div className="h-14 animate-pulse rounded-xl bg-secondary" />
                <div className="h-14 animate-pulse rounded-xl bg-secondary" />
              </div>
            )}
          </div>

          {Number(recommendedRepayUsdc) > 0 && (
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Recommended buffer action: repaying{' '}
              <span className="tabular-financial font-semibold text-foreground">
                {recommendedRepayUsdc} USDC
              </span>{' '}
              lifts your Blend loan cleanly above the 1.60x target line.
            </div>
          )}
        </section>

        {/* Midnight-Navy YieldGuard Security Card (Mirrors Landing Page Dark Security Card) */}
        <section
          aria-label="YieldGuardPolicy On-Chain Security"
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#232A4D] bg-gradient-to-br from-[#0A0E24] via-[#111633] to-[#191F45] p-5 text-white shadow-[0_14px_34px_rgba(10,14,36,0.16)]"
        >
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-300">Soroban Guardrail Contract</div>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-white">
                  YieldGuardPolicy
                </h2>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-semibold',
                  policy.isPaused ? 'text-rose-400' : 'text-emerald-400',
                )}
              >
                {policy.isPaused ? (
                  <>
                    <ShieldOff className="size-3.5" />
                    <span>Frozen</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5" />
                    <span>Active</span>
                  </>
                )}
              </span>
            </div>

            {/* Key Limits Grid */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-white/10 py-3.5">
              <div>
                <div className="text-[11px] text-slate-400">Max Single Tx</div>
                <div className="mt-1 tabular-financial text-sm font-semibold text-white">
                  ${summary.singleTxCapUsdc.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Min HF Floor</div>
                <div className="mt-1 tabular-financial text-sm font-semibold text-emerald-400">
                  {summary.minHealthFactorFormatted}x
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Approved Apps</div>
                <div className="mt-1 tabular-financial text-sm font-semibold text-white">
                  {policy.allowedProtocols.length} contracts
                </div>
              </div>
            </div>

            {/* 24h Spend Progress */}
            <div className="mt-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">24-hour rolling cap</span>
                <span className="tabular-financial font-medium text-white">
                  ${summary.spentTodayUsdc.toFixed(0)} / ${summary.dailyLimitUsdc.toLocaleString()}{' '}
                  USDC ({summary.dailyUtilizationPct}%)
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/12">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    summary.dailyUtilizationPct >= 90
                      ? 'bg-rose-400'
                      : summary.dailyUtilizationPct >= 70
                        ? 'bg-amber-400'
                        : 'bg-[#8B75FF]',
                  )}
                  style={{ width: `${Math.max(4, summary.dailyUtilizationPct)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenGuardrails}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white/12 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Configure Guardrails</span>
            </button>

            <button
              type="button"
              onClick={onOpenGuardrails}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer whitespace-nowrap',
                policy.isPaused
                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-rose-500/22 text-rose-200 hover:bg-rose-500/32',
              )}
            >
              {policy.isPaused ? (
                <>
                  <ShieldCheck className="size-3.5" />
                  <span>Unfreeze</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="size-3.5" />
                  <span>Emergency Freeze</span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* Row 3: Live DeFindex USDC Yield Vaults Comparison */}
      <section
        aria-label="Allowlisted DeFindex Yield Vaults"
        className="rounded-2xl border border-border bg-card p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:shadow-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Best DeFindex USDC Vaults (Net of Soroban Fees)
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked deterministically against Blend baseline supply (
              {yieldComparison
                ? formatBpsAsPercent(yieldComparison.currentBlendSupplyApyBps)
                : '4.15%'}
              )
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={onCompareYields}
            className="min-h-9 text-xs"
          >
            Run Full Comparison
          </Button>
        </div>

        {yieldComparison ? (
          <div className="mt-4 divide-y divide-border">
            {yieldComparison.quotes.map((quote) => (
              <div
                key={quote.vaultId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {quote.vaultName}
                    </span>
                    <span className="text-xs text-muted-foreground" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        quote.allowlistedInGuard ? 'text-risk-safe' : 'text-muted-foreground',
                      )}
                    >
                      {quote.allowlistedInGuard ? (
                        <>
                          <ShieldCheck className="size-3.5" />
                          <span>Allowlisted</span>
                        </>
                      ) : (
                        <>
                          <Lock className="size-3" />
                          <span>Not allowlisted</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 tabular-financial text-xs text-muted-foreground">
                    Gross {formatBpsAsPercent(quote.grossApyBps)} · Fee{' '}
                    {quote.estimatedSorobanFeeXlm} XLM (${quote.estimatedSorobanFeeUsd})
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="tabular-financial text-sm font-bold text-foreground">
                      {formatBpsAsPercent(quote.netApyBps)} Net APY
                    </div>
                    <div
                      className={cn(
                        'tabular-financial text-xs font-medium',
                        quote.netApyDeltaBps >= 0 ? 'text-risk-safe' : 'text-risk-danger',
                      )}
                    >
                      {formatBpsAsPercent(quote.netApyDeltaBps, true)} vs Blend
                    </div>
                  </div>

                  <Button
                    variant={quote.allowlistedInGuard ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={isBusy || !quote.allowlistedInGuard}
                    onClick={() => onSimulateDeFindex('800.00', quote.vaultName)}
                    className="min-h-9 px-3 text-xs"
                  >
                    {quote.allowlistedInGuard ? 'Simulate Deposit' : 'Blocked'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="h-12 animate-pulse rounded-xl bg-secondary" />
            <div className="h-12 animate-pulse rounded-xl bg-secondary" />
          </div>
        )}
      </section>
    </div>
  );
}
