'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  HealthRiskBand,
  TransactionProposal,
} from '../../../../packages/agent-core/src/types';
import { submitSignedXdrToTestnet } from '../lib/stellar';
import { cn, formatBpsAsPercent, formatDecimalWithCommas, truncateAddress } from '../lib/utils';
import { useWallet } from './WalletProvider';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

export interface TxPreviewCardProps {
  readonly proposal: TransactionProposal;
  readonly onExecuted?: (proposal: TransactionProposal, txHash?: string) => void;
}

function hfBpsToGaugePercent(bps: number): number {
  // Visual scale: 1.00x (10_000 bps) -> 0%, 2.50x (25_000 bps) -> 100%
  const clamped = Math.max(10_000, Math.min(25_000, bps));
  return ((clamped - 10_000) / 15_000) * 100;
}

function riskTextClass(band: HealthRiskBand): string {
  if (band === 'safe') return 'text-risk-safe';
  if (band === 'caution') return 'text-risk-caution';
  return 'text-risk-danger';
}

function riskBarClass(band: HealthRiskBand): string {
  if (band === 'safe') return 'bg-risk-safe';
  if (band === 'caution') return 'bg-risk-caution';
  return 'bg-risk-danger';
}

export function TxPreviewCard({ proposal, onExecuted }: TxPreviewCardProps) {
  const { address, signTransaction } = useWallet();
  const [signingState, setSigningState] = React.useState<
    'idle' | 'signing' | 'signed' | 'error'
  >('idle');
  const [signedTxHash, setSignedTxHash] = React.useState<string | null>(null);
  const [checksExpanded, setChecksExpanded] = React.useState(
    proposal.guardrail.status !== 'compliant',
  );

  const isCompliant = proposal.guardrail.status === 'compliant';
  const isPaused = proposal.guardrail.status === 'paused';
  const beforePct = hfBpsToGaugePercent(proposal.healthFactor.beforeBps);
  const afterPct = hfBpsToGaugePercent(proposal.healthFactor.afterBps);
  const cautionThresholdPct = hfBpsToGaugePercent(12_500); // 16.67%
  const safeThresholdPct = hfBpsToGaugePercent(15_000); // 33.33%

  const handleApproveAndSign = async () => {
    if (!isCompliant) {
      toast.error('Execution blocked by YieldGuardPolicy', {
        description: 'Adjust your guardrail limits or lift Emergency Freeze before signing.',
      });
      return;
    }
    if (!address) {
      toast.error('Connect a Stellar Testnet wallet to sign this proposal.');
      return;
    }

    setSigningState('signing');
    const toastId = toast.loading(`Requesting wallet signature for ${proposal.title}…`);

    try {
      const { signedTxXdr, simulatedPreview } = await signTransaction(
        proposal.unsignedXdr,
        proposal.networkPassphrase,
      );

      if (!simulatedPreview && proposal.simulation.status === 'verified') {
        const res = await submitSignedXdrToTestnet(signedTxXdr);
        setSignedTxHash(res.hash);
        setSigningState('signed');
        toast.success(`Submitted to Stellar Testnet`, {
          id: toastId,
          description: `Tx ${truncateAddress(res.hash, 8, 6)} · Status: ${res.status}`,
        });
        onExecuted?.(proposal, res.hash);
      } else {
        setSignedTxHash(proposal.proposalId);
        setSigningState('signed');
        toast.success(`Approved in Testnet Preview`, {
          id: toastId,
          description:
            'Connect Freighter or xBull to broadcast the signed Soroban XDR on-chain.',
        });
        onExecuted?.(proposal);
      }
    } catch (err) {
      setSigningState('error');
      toast.error('Transaction signing failed', {
        id: toastId,
        description: err instanceof Error ? err.message : 'Signature rejected in wallet',
      });
    }
  };

  return (
    /* Concentric Radii: Outer 18px with p-2.5 (10px) -> Inner panels 8px (18 - 10 = 8px) */
    <section
      aria-label={`Simulated Transaction Proposal: ${proposal.title}`}
      className="mt-3 rounded-[18px] border border-border bg-card p-2.5 text-card-foreground"
    >
      {/* Inner Container 1: Header & Guardrail Compliance */}
      <div className="rounded-[8px] bg-surface-inset px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold tracking-tight text-foreground">
              {proposal.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="capitalize">{proposal.targetProtocol}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-financial">
                {truncateAddress(proposal.targetContractId, 6, 4)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {proposal.simulation.status === 'verified'
                  ? 'RPC Verified'
                  : 'Unsigned Preview'}
              </span>
            </div>
          </div>

          <Badge
            variant={isCompliant ? 'safe' : 'danger'}
            className="shrink-0"
          >
            {isCompliant ? (
              <>
                <ShieldCheck className="size-3" />
                <span>YieldGuard Compliant</span>
              </>
            ) : isPaused ? (
              <>
                <ShieldOff className="size-3" />
                <span>Guard Frozen</span>
              </>
            ) : (
              <>
                <Lock className="size-3" />
                <span>Policy Blocked</span>
              </>
            )}
          </Badge>
        </div>

        {/* Token Balance Diffs (tabular-nums) */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            Simulated Balance Diffs
          </div>
          <div className="divide-y divide-border rounded-[8px] border border-border bg-card">
            {proposal.tokenDiffs.map((diff, idx) => {
              const isInflow = diff.direction === 'inflow';
              return (
                <div
                  key={`${diff.asset.code}-${diff.direction}-${idx}`}
                  className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-[6px]',
                        isInflow
                          ? 'bg-risk-safe-surface text-risk-safe'
                          : 'bg-risk-danger-surface text-risk-danger',
                      )}
                    >
                      {isInflow ? (
                        <ArrowDownLeft className="size-3.5" />
                      ) : (
                        <ArrowUpRight className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {diff.asset.symbol}
                      </div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {isInflow ? 'Inflow' : 'Outflow'} · {diff.counterpartyProtocol}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        'tabular-financial text-sm font-semibold tracking-tight',
                        isInflow ? 'text-risk-safe' : 'text-risk-danger',
                      )}
                    >
                      {isInflow ? '+' : '-'}
                      {formatDecimalWithCommas(diff.amountFormatted)} {diff.asset.symbol}
                    </div>
                    <div className="tabular-financial text-[11px] text-muted-foreground">
                      ${formatDecimalWithCommas(diff.usdValue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Visual Health Factor Before -> After Bar */}
        <div className="mt-4 rounded-[8px] border border-border bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Blend Health Factor Projection
            </span>
            <div className="flex items-center gap-2 tabular-financial text-sm font-semibold">
              <span className={riskTextClass(proposal.healthFactor.beforeBand)}>
                {proposal.healthFactor.beforeFormatted}x
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className={riskTextClass(proposal.healthFactor.afterBand)}>
                {proposal.healthFactor.afterFormatted}x
              </span>
              <span className="text-xs font-normal text-muted-foreground capitalize">
                ({proposal.healthFactor.afterBand})
              </span>
            </div>
          </div>

          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            {/* Before position subtle ghost fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/15"
              style={{ width: `${beforePct}%` }}
            />
            {/* After position semantic fill */}
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out',
                riskBarClass(proposal.healthFactor.afterBand),
              )}
              style={{ width: `${afterPct}%` }}
            />
            {/* Threshold tick 1.25x */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-background/80"
              style={{ left: `${cautionThresholdPct}%` }}
            />
            {/* Threshold tick 1.50x */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-background/80"
              style={{ left: `${safeThresholdPct}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-financial">1.00x Liq.</span>
            <span className="tabular-financial">
              Drop Buffer: {proposal.healthFactor.liquidationDropBeforePct}% →{' '}
              <strong className="font-medium text-foreground">
                {proposal.healthFactor.liquidationDropAfterPct}%
              </strong>
            </span>
            <span className="tabular-financial">2.50x+</span>
          </div>
        </div>

        {/* Network Fee, APY Delta & Daily Cap Remaining */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-[8px] border border-border bg-card px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Est. Soroban Fee</div>
            <div className="mt-0.5 tabular-financial text-xs font-medium text-foreground">
              {proposal.simulation.recommendedFeeXlm} XLM
            </div>
            <div className="tabular-financial text-[11px] text-muted-foreground">
              ${proposal.simulation.recommendedFeeUsd}
            </div>
          </div>

          <div className="rounded-[8px] border border-border bg-card px-3 py-2">
            <div className="text-[11px] text-muted-foreground">24h Cap Remaining</div>
            <div className="mt-0.5 tabular-financial text-xs font-medium text-foreground">
              ${formatDecimalWithCommas(proposal.guardrail.remainingDailyAllowanceFormatted)}
            </div>
            <div className="tabular-financial text-[11px] text-muted-foreground">
              {(proposal.guardrail.dailyCapUtilizationAfterTxBps / 100).toFixed(0)}% used after tx
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-[8px] border border-border bg-card px-3 py-2">
            <div className="text-[11px] text-muted-foreground">
              {proposal.netApyDeltaBps !== undefined ? 'Net APY Delta' : 'Simulation Ledger'}
            </div>
            {proposal.netApyDeltaBps !== undefined ? (
              <>
                <div
                  className={cn(
                    'mt-0.5 tabular-financial text-xs font-medium',
                    proposal.netApyDeltaBps >= 0 ? 'text-risk-safe' : 'text-risk-danger',
                  )}
                >
                  {formatBpsAsPercent(proposal.netApyDeltaBps, true)}
                </div>
                <div className="text-[11px] text-muted-foreground">After Soroban fees</div>
              </>
            ) : (
              <>
                <div className="mt-0.5 tabular-financial text-xs font-medium text-foreground">
                  {proposal.simulation.latestLedger > 0
                    ? `#${proposal.simulation.latestLedger.toLocaleString()}`
                    : 'Testnet Ready'}
                </div>
                <div className="tabular-financial text-[11px] text-muted-foreground">
                  {proposal.simulation.cpuInstructions > 0
                    ? `${(proposal.simulation.cpuInstructions / 1_000_000).toFixed(2)}M CPU`
                    : 'Non-custodial XDR'}
                </div>
              </>
            )}
          </div>
        </div>

        {/* YieldGuardPolicy Check Breakdown */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setChecksExpanded((prev) => !prev)}
            aria-expanded={checksExpanded}
            className="flex min-h-9 w-full items-center justify-between rounded-[8px] px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <span>
              YieldGuardPolicy verification (
              {proposal.guardrail.checks.filter((c) => c.passed).length}/
              {proposal.guardrail.checks.length} rules passed)
            </span>
            {checksExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>

          {checksExpanded && (
            <div className="mt-1.5 flex flex-col gap-1.5 rounded-[8px] border border-border bg-card p-3">
              {proposal.guardrail.checks.map((check) => (
                <div
                  key={check.rule}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {check.passed ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-risk-safe" />
                    ) : (
                      <XCircle className="size-3.5 shrink-0 text-risk-danger" />
                    )}
                    <span className="truncate text-foreground">{check.label}</span>
                  </div>
                  <div className="tabular-financial text-[11px] text-muted-foreground shrink-0">
                    <span className={check.passed ? 'text-foreground' : 'text-risk-danger'}>
                      {check.observed}
                    </span>{' '}
                    / {check.limit}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Explicit RPC or policy warnings */}
        {proposal.warnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-[8px] border border-risk-caution-border bg-risk-caution-surface/60 px-3 py-2 text-xs text-risk-caution">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="leading-relaxed">{proposal.warnings[0]}</div>
          </div>
        )}
      </div>

      {/* Footer Action Bar */}
      <Separator className="my-2.5" />
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-1.5 pb-1">
        <div className="text-xs text-muted-foreground">
          {signingState === 'signed' && signedTxHash ? (
            <span className="text-risk-safe">
              Signed & confirmed ({truncateAddress(signedTxHash, 8, 6)})
            </span>
          ) : isCompliant ? (
            <span>Non-custodial · Your wallet signs the final Soroban XDR</span>
          ) : (
            <span className="text-risk-danger">
              Signing disabled until YieldGuardPolicy checks pass
            </span>
          )}
        </div>

        <Button
          variant={signingState === 'signed' ? 'safe' : isCompliant ? 'default' : 'outline'}
          size="default"
          onClick={() => void handleApproveAndSign()}
          disabled={!isCompliant || signingState === 'signing' || signingState === 'signed'}
          className="sm:min-w-[230px]"
        >
          {signingState === 'signing'
            ? 'Awaiting Wallet Signature…'
            : signingState === 'signed'
              ? 'Approved & Signed'
              : proposal.ctaLabel}
        </Button>
      </div>
    </section>
  );
}
