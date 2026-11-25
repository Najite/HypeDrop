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
import { Button } from './ui/button';
import { Separator } from './ui/separator';

export interface TxPreviewCardProps {
  readonly proposal: TransactionProposal;
  readonly onExecuted?: (proposal: TransactionProposal, txHash?: string) => void;
}

function hfBpsToGaugePercent(bps: number): number {
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
  const cautionThresholdPct = hfBpsToGaugePercent(12_500);
  const safeThresholdPct = hfBpsToGaugePercent(15_000);

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
        toast.success('Submitted to Stellar Testnet', {
          id: toastId,
          description: `Tx ${truncateAddress(res.hash, 8, 6)} · Status: ${res.status}`,
        });
        onExecuted?.(proposal, res.hash);
      } else {
        setSignedTxHash(proposal.proposalId);
        setSigningState('signed');
        toast.success('Approved in Testnet Preview', {
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
    /* Concentric Radii: Outer 18px with p-2 (8px) -> Inner panels 10px */
    <section
      aria-label={`Simulated Transaction Proposal: ${proposal.title}`}
      className="mt-3 rounded-[18px] border border-border bg-surface-inset p-2 text-card-foreground"
    >
      <div className="rounded-[10px] border border-border/70 bg-card p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold tracking-tight text-foreground">
              {proposal.title}
            </h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="capitalize">{proposal.targetProtocol}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-financial">
                {truncateAddress(proposal.targetContractId, 5, 4)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {proposal.simulation.status === 'verified'
                  ? 'RPC Verified'
                  : 'Unsigned Preview'}
              </span>
            </div>
          </div>

          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold shrink-0',
              isCompliant ? 'text-risk-safe' : 'text-risk-danger',
            )}
          >
            {isCompliant ? (
              <>
                <ShieldCheck className="size-3.5" />
                <span>YieldGuard Pass</span>
              </>
            ) : isPaused ? (
              <>
                <ShieldOff className="size-3.5" />
                <span>Guard Frozen</span>
              </>
            ) : (
              <>
                <Lock className="size-3.5" />
                <span>Policy Blocked</span>
              </>
            )}
          </span>
        </div>

        {/* Token Balance Diffs */}
        <div className="mt-3.5 divide-y divide-border border-y border-border">
          {proposal.tokenDiffs.map((diff, idx) => {
            const isInflow = diff.direction === 'inflow';
            return (
              <div
                key={`${diff.asset.code}-${diff.direction}-${idx}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg',
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
                    <div className="text-xs font-semibold text-foreground">
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
                      'tabular-financial text-xs font-semibold tracking-tight',
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

        {/* Visual Health Factor Before -> After Bar */}
        <div className="mt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Health Factor Impact
            </span>
            <div className="flex items-center gap-1.5 tabular-financial text-xs font-semibold">
              <span className={riskTextClass(proposal.healthFactor.beforeBand)}>
                {proposal.healthFactor.beforeFormatted}x
              </span>
              <ArrowRight className="size-3 text-muted-foreground" />
              <span className={riskTextClass(proposal.healthFactor.afterBand)}>
                {proposal.healthFactor.afterFormatted}x
              </span>
              <span className="font-normal text-muted-foreground capitalize">
                ({proposal.healthFactor.afterBand})
              </span>
            </div>
          </div>

          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/15"
              style={{ width: `${beforePct}%` }}
            />
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out',
                riskBarClass(proposal.healthFactor.afterBand),
              )}
              style={{ width: `${afterPct}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-card"
              style={{ left: `${cautionThresholdPct}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-card"
              style={{ left: `${safeThresholdPct}%` }}
            />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-financial">
            <span>
              Drop buffer {proposal.healthFactor.liquidationDropBeforePct}% →{' '}
              <strong className="font-semibold text-foreground">
                {proposal.healthFactor.liquidationDropAfterPct}%
              </strong>
            </span>
            <span>Fee {proposal.simulation.recommendedFeeXlm} XLM</span>
          </div>
        </div>

        {/* Key Metadata Summary Line */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] text-muted-foreground tabular-financial">
          <span>
            24h cap left:{' '}
            <strong className="font-medium text-foreground">
              ${formatDecimalWithCommas(proposal.guardrail.remainingDailyAllowanceFormatted)}
            </strong>
          </span>
          {proposal.netApyDeltaBps !== undefined ? (
            <span
              className={cn(
                'font-semibold',
                proposal.netApyDeltaBps >= 0 ? 'text-risk-safe' : 'text-risk-danger',
              )}
            >
              {formatBpsAsPercent(proposal.netApyDeltaBps, true)} Net APY
            </span>
          ) : (
            <span>
              {proposal.simulation.latestLedger > 0
                ? `Ledger #${proposal.simulation.latestLedger.toLocaleString()}`
                : 'Non-custodial XDR'}
            </span>
          )}
        </div>

        {/* Expandable 5-Rule YieldGuard Verification */}
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setChecksExpanded((prev) => !prev)}
            aria-expanded={checksExpanded}
            className="flex min-h-8 w-full items-center justify-between rounded-lg px-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <span>
              YieldGuard rules ({proposal.guardrail.checks.filter((c) => c.passed).length}/
              {proposal.guardrail.checks.length} passed)
            </span>
            {checksExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>

          {checksExpanded && (
            <div className="mt-1.5 flex flex-col gap-1.5 rounded-lg bg-surface-inset p-2.5">
              {proposal.guardrail.checks.map((check) => (
                <div
                  key={check.rule}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {check.passed ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-risk-safe" />
                    ) : (
                      <XCircle className="size-3.5 shrink-0 text-risk-danger" />
                    )}
                    <span className="truncate text-foreground">{check.label}</span>
                  </div>
                  <div className="tabular-financial text-muted-foreground shrink-0">
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

        {proposal.warnings.length > 0 && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-risk-caution-border bg-risk-caution-surface px-2.5 py-2 text-[11px] text-risk-caution">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="leading-relaxed">{proposal.warnings[0]}</div>
          </div>
        )}
      </div>

      {/* Footer Action Bar */}
      <Separator className="my-2 opacity-0" />
      <div className="flex flex-col gap-2 px-1 pb-0.5">
        <Button
          variant={signingState === 'signed' ? 'safe' : isCompliant ? 'default' : 'outline'}
          size="default"
          onClick={() => void handleApproveAndSign()}
          disabled={!isCompliant || signingState === 'signing' || signingState === 'signed'}
          className="w-full"
        >
          {signingState === 'signing'
            ? 'Awaiting Wallet Signature…'
            : signingState === 'signed'
              ? 'Approved & Signed'
              : proposal.ctaLabel}
        </Button>

        <div className="text-center text-[11px] text-muted-foreground">
          {signingState === 'signed' && signedTxHash ? (
            <span className="font-medium text-risk-safe">
              Signed &amp; confirmed ({truncateAddress(signedTxHash, 8, 6)})
            </span>
          ) : isCompliant ? (
            <span>Non-custodial · Your wallet signs the final Soroban XDR</span>
          ) : (
            <span className="text-risk-danger">
              Signing blocked until YieldGuardPolicy checks pass
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
