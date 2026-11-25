'use client';

import * as React from 'react';
import {
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  isTransactionProposal,
  type AgentToolTrace,
  type BlendPosition,
  type CopilotMessage,
  type CopilotStreamEvent,
  type DeFindexYieldComparison,
  type PortfolioHealthSnapshot,
  type TransactionProposal,
  type YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';
import {
  atomicStroopsToUsdcNumber,
  cn,
  formatBpsAsPercent,
  formatDecimalWithCommas,
} from '../lib/utils';
import { ChatCopilot } from './ChatCopilot';
import { GuardrailDrawer } from './GuardrailDrawer';
import {
  PREVIEW_TESTNET_ADDRESS,
  WalletConnectionControl,
  WalletProvider,
  useWallet,
} from './WalletProvider';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Toaster } from './ui/sonner';
import { TooltipProvider } from './ui/tooltip';

interface PortfolioApiResponse {
  readonly snapshot: PortfolioHealthSnapshot;
  readonly policy: YieldGuardPolicy;
  readonly recommendedRepayToSafeUsdc: string;
  readonly yields: DeFindexYieldComparison;
}

const FALLBACK_POLICY: YieldGuardPolicy = {
  owner: PREVIEW_TESTNET_ADDRESS,
  agentSigner: PREVIEW_TESTNET_ADDRESS,
  maxSingleTxAmount: '10000000000',
  dailySpendLimit: '25000000000',
  spentInWindow: '0',
  windowStart: Math.floor(Date.now() / 1000),
  minHealthFactorBps: 15_000,
  allowedProtocols: [
    'CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65',
    'CAFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQX4KO',
    'CAGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAZTCD',
    'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS',
  ],
  isPaused: false,
};

function hfBandColor(band: PortfolioHealthSnapshot['riskBand']): string {
  if (band === 'safe') return 'text-risk-safe';
  if (band === 'caution') return 'text-risk-caution';
  return 'text-risk-danger';
}

function hfBarColor(band: PortfolioHealthSnapshot['riskBand']): string {
  if (band === 'safe') return 'bg-risk-safe';
  if (band === 'caution') return 'bg-risk-caution';
  return 'bg-risk-danger';
}

export interface HyperDropShellProps {
  readonly onNavigateHome?: () => void;
  readonly hideToaster?: boolean;
}

function HyperDropWorkspace({ onNavigateHome, hideToaster }: HyperDropShellProps) {
  const { address, network } = useWallet();
  const activeWallet = address ?? PREVIEW_TESTNET_ADDRESS;

  const [snapshot, setSnapshot] = React.useState<PortfolioHealthSnapshot | null>(null);
  const [policy, setPolicy] = React.useState<YieldGuardPolicy>(FALLBACK_POLICY);
  const [yieldComparison, setYieldComparison] =
    React.useState<DeFindexYieldComparison | null>(null);
  const [recommendedRepayUsdc, setRecommendedRepayUsdc] = React.useState<string>('0.00');
  const [isLoadingPortfolio, setIsLoadingPortfolio] = React.useState(true);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const [messages, setMessages] = React.useState<CopilotMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isSimulatingAction, setIsSimulatingAction] = React.useState(false);

  const loadPortfolio = React.useCallback(
    async (customPolicy?: YieldGuardPolicy, customPositions?: readonly BlendPosition[]) => {
      setIsLoadingPortfolio(true);
      try {
        const res = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: activeWallet,
            network,
            policySnapshot: customPolicy,
            positionsOverride: customPositions,
          }),
        });
        if (!res.ok) {
          throw new Error(`Portfolio endpoint returned ${res.status}`);
        }
        const data = (await res.json()) as PortfolioApiResponse;
        setSnapshot(data.snapshot);
        if (!customPolicy) {
          setPolicy((prev) => ({
            ...data.policy,
            isPaused: prev.isPaused,
            maxSingleTxAmount: prev.maxSingleTxAmount,
            dailySpendLimit: prev.dailySpendLimit,
            minHealthFactorBps: prev.minHealthFactorBps,
            spentInWindow: prev.spentInWindow,
            allowedProtocols: prev.allowedProtocols,
          }));
        }
        setRecommendedRepayUsdc(data.recommendedRepayToSafeUsdc);
        setYieldComparison(data.yields);
      } catch (err) {
        toast.error('Could not load Blend Testnet portfolio', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      } finally {
        setIsLoadingPortfolio(false);
      }
    },
    [activeWallet, network],
  );

  React.useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const handleQuickSimulate = React.useCallback(
    async (params: {
      readonly actionType: 'repay_debt' | 'rebalance_vault';
      readonly amount: string;
      readonly targetProtocol: 'blend' | 'defindex';
      readonly userLabel: string;
    }) => {
      setIsSimulatingAction(true);
      const userMsgId = `usr_${Date.now()}`;
      const assistantMsgId = `ast_${Date.now() + 1}`;
      const traceId = `tr_${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          content: params.userLabel,
          createdAt: new Date().toISOString(),
        },
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          toolTraces: [
            {
              id: traceId,
              toolName: 'simulate_rebalance_or_repay',
              status: 'running',
            },
          ],
        },
      ]);

      try {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: activeWallet,
            network,
            actionType: params.actionType,
            assetCode: 'USDC',
            amount: params.amount,
            targetProtocol: params.targetProtocol,
            policySnapshot: policy,
            positionsOverride: snapshot?.positions,
          }),
        });

        const payload = (await res.json()) as TransactionProposal | { error?: string };
        if (!res.ok || !isTransactionProposal(payload)) {
          throw new Error(
            'error' in payload && payload.error
              ? payload.error
              : 'Simulation returned an invalid TransactionProposal',
          );
        }

        const guardNote =
          payload.guardrail.status === 'compliant'
            ? 'All YieldGuardPolicy rules passed. Inspect the balance diffs and Health Factor projection below before signing.'
            : payload.guardrail.status === 'paused'
              ? 'Blocked: Emergency Freeze is active on YieldGuardPolicy. Lift the freeze in Guardrails before signing.'
              : 'Blocked by YieldGuardPolicy. Review the failed rule below or adjust your policy caps in Guardrails.';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `${payload.summary} ${guardNote}`,
                  proposal: payload,
                  toolTraces: [
                    {
                      id: traceId,
                      toolName: 'simulate_rebalance_or_repay',
                      status: 'completed',
                      summary: `${payload.title} · HF ${payload.healthFactor.beforeFormatted}x → ${payload.healthFactor.afterFormatted}x · Guard ${payload.guardrail.status}`,
                    },
                  ],
                }
              : m,
          ),
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Simulation failed';
        toast.error('Simulation failed', { description: errMsg });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Unable to complete Soroban transaction simulation: ${errMsg}`,
                  toolTraces: [
                    {
                      id: traceId,
                      toolName: 'simulate_rebalance_or_repay',
                      status: 'error',
                      summary: errMsg,
                    },
                  ],
                }
              : m,
          ),
        );
      } finally {
        setIsSimulatingAction(false);
      }
    },
    [activeWallet, network, policy, snapshot?.positions],
  );

  const handleQuickCompareYields = React.useCallback(async () => {
    setIsSimulatingAction(true);
    const userMsgId = `usr_${Date.now()}`;
    const assistantMsgId = `ast_${Date.now() + 1}`;
    const traceId = `tr_${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: 'Compare allowlisted DeFindex USDC vaults net of Soroban fees for 1,000 USDC.',
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        toolTraces: [
          {
            id: traceId,
            toolName: 'compare_defindex_yields',
            status: 'running',
          },
        ],
      },
    ]);

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: activeWallet,
          network,
          policySnapshot: policy,
          positionsOverride: snapshot?.positions,
        }),
      });
      if (!res.ok) {
        throw new Error(`Yield comparison failed (${res.status})`);
      }
      const data = (await res.json()) as PortfolioApiResponse;
      setYieldComparison(data.yields);

      const lines = data.yields.quotes.map((q) => {
        const allowText = q.allowlistedInGuard ? 'Allowlisted' : 'Not allowlisted';
        return `• ${q.vaultName}: ${formatBpsAsPercent(q.netApyBps)} net APY (${formatBpsAsPercent(q.netApyDeltaBps, true)} vs Blend supply · Soroban fee ${q.estimatedSorobanFeeXlm} XLM / $${q.estimatedSorobanFeeUsd} · ${allowText})`;
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Evaluated DeFindex Testnet USDC vaults for 1,000.00 USDC over a 90-day horizon against Blend baseline supply (${formatBpsAsPercent(data.yields.currentBlendSupplyApyBps)}):\n\n${lines.join('\n')}`,
                toolTraces: [
                  {
                    id: traceId,
                    toolName: 'compare_defindex_yields',
                    status: 'completed',
                    summary: `${data.yields.quotes.length} vaults ranked after Soroban fees`,
                  },
                ],
              }
            : m,
        ),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to compare yields';
      toast.error('Yield comparison failed', { description: errMsg });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Unable to compare DeFindex vaults: ${errMsg}`,
                toolTraces: [
                  {
                    id: traceId,
                    toolName: 'compare_defindex_yields',
                    status: 'error',
                    summary: errMsg,
                  },
                ],
              }
            : m,
        ),
      );
    } finally {
      setIsSimulatingAction(false);
    }
  }, [activeWallet, network, policy, snapshot?.positions]);

  const handleSendPrompt = React.useCallback(
    async (promptText: string) => {
      const userMessage: CopilotMessage = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: promptText,
        createdAt: new Date().toISOString(),
      };
      const assistantMsgId = `ast_${Date.now() + 1}`;
      const historyPayload = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          toolTraces: [],
        },
      ]);
      setIsStreaming(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: activeWallet,
            network,
            messages: historyPayload,
            policySnapshot: policy,
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text();
          throw new Error(errText || `Chat API returned ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            let event: CopilotStreamEvent;
            try {
              event = JSON.parse(line) as CopilotStreamEvent;
            } catch {
              continue;
            }

            if (event.type === 'text_delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.delta }
                    : m,
                ),
              );
            } else if (event.type === 'tool_trace') {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  const existing = m.toolTraces ?? [];
                  const idx = existing.findIndex((t) => t.id === event.trace.id);
                  const nextTraces: AgentToolTrace[] =
                    idx >= 0
                      ? existing.map((t, i) => (i === idx ? event.trace : t))
                      : [...existing, event.trace];
                  return { ...m, toolTraces: nextTraces };
                }),
              );
            } else if (event.type === 'proposal') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, proposal: event.proposal } : m,
                ),
              );
            } else if (event.type === 'error') {
              toast.error('HyperDrop Copilot error', { description: event.message });
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content:
                          m.content.length > 0
                            ? `${m.content}\n\n${event.message}`
                            : event.message,
                      }
                    : m,
                ),
              );
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to reach HyperDrop Copilot';
        toast.error('Copilot request failed', { description: msg });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: msg } : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeWallet, messages, network, policy],
  );

  const handleProposalExecuted = React.useCallback(
    (proposal: TransactionProposal) => {
      const outflowDiff = proposal.tokenDiffs.find((d) => d.direction === 'outflow');
      const spentDelta = outflowDiff ? BigInt(outflowDiff.amountAtomic) : 0n;
      const nextPolicy: YieldGuardPolicy = {
        ...policy,
        spentInWindow: (BigInt(policy.spentInWindow) + spentDelta).toString(),
      };
      setPolicy(nextPolicy);

      if (snapshot && proposal.actionType === 'repay_debt' && outflowDiff) {
        const nextPositions: BlendPosition[] = snapshot.positions.map((pos) => {
          if (pos.asset.code !== outflowDiff.asset.code) return pos;
          const prevDebt = BigInt(pos.debtAtomic);
          const nextDebt = prevDebt > spentDelta ? prevDebt - spentDelta : 0n;
          const nextDebtUsdc = atomicStroopsToUsdcNumber(nextDebt.toString());
          return {
            ...pos,
            debtAtomic: nextDebt.toString(),
            debtFormatted: nextDebtUsdc.toFixed(2),
            debtUsd: nextDebtUsdc.toFixed(2),
          };
        });
        void loadPortfolio(nextPolicy, nextPositions);
      }
    },
    [loadPortfolio, policy, snapshot],
  );

  const hfGaugePct = snapshot
    ? Math.max(
        0,
        Math.min(100, ((snapshot.healthFactorBps - 10_000) / 15_000) * 100),
      )
    : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 sm:px-6 backdrop-blur-sm">
        {/* Zone 1: Single-line Brand Wordmark */}
        {onNavigateHome ? (
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="HyperDrop — return to landing page"
            className="text-base font-semibold tracking-tight text-foreground whitespace-nowrap shrink-0 cursor-pointer hover:text-foreground/85 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[6px]"
          >
            HyperDrop
          </button>
        ) : (
          <a
            href="#workspace"
            className="text-base font-semibold tracking-tight text-foreground whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[6px]"
          >
            HyperDrop
          </a>
        )}

        {/* Zone 2: Quiet unboxed context metadata */}
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
          <span>Stellar Testnet</span>
          <span aria-hidden="true">·</span>
          <span>Blend</span>
          <span aria-hidden="true">·</span>
          <span>DeFindex</span>
          <span aria-hidden="true">·</span>
          <span>Soroswap</span>
        </div>

        {/* Zone 3: Guardrails trigger + Wallet control */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant={policy.isPaused ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setDrawerOpen(true)}
            className={cn(!policy.isPaused && 'bg-card')}
          >
            {policy.isPaused ? (
              <ShieldAlert className="size-4" />
            ) : (
              <SlidersHorizontal className="size-4" />
            )}
            <span>{policy.isPaused ? 'Guard Frozen' : 'Guardrails'}</span>
          </Button>
          <WalletConnectionControl />
        </div>
      </header>

      {/* Main Split Workspace */}
      <main
        id="workspace"
        className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[312px_1fr] overflow-hidden"
      >
        {/* Compact Non-Sticky Mobile Portfolio Strip */}
        {snapshot && (
          <div className="flex lg:hidden shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-inset px-4 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground">Blend HF</span>
              <span
                className={cn(
                  'tabular-financial font-semibold',
                  hfBandColor(snapshot.riskBand),
                )}
              >
                {snapshot.healthFactorFormatted}x
              </span>
              <span className="text-muted-foreground capitalize">({snapshot.riskBand})</span>
            </div>
            <span className="tabular-financial text-muted-foreground shrink-0">
              -{snapshot.liquidationPriceDropPct}% drop
            </span>
          </div>
        )}

        {/* Left Sidebar: Blend Risk Ledger & Policy Summary */}
        <aside
          aria-label="Blend Portfolio and Guardrail Summary"
          className="hidden lg:flex min-h-0 flex-col border-r border-border bg-surface-inset/50"
        >
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-4">
              {/* Health Factor Primary Readout */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-medium text-muted-foreground">
                    Blend Health Factor
                  </h2>
                  <button
                    type="button"
                    onClick={() => void loadPortfolio(policy, snapshot?.positions)}
                    disabled={isLoadingPortfolio}
                    aria-label="Refresh Blend portfolio health"
                    className="inline-flex size-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <RefreshCw
                      className={cn('size-3.5', isLoadingPortfolio && 'animate-spin')}
                    />
                  </button>
                </div>

                {snapshot ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'tabular-financial text-3xl font-semibold tracking-tight',
                          hfBandColor(snapshot.riskBand),
                        )}
                      >
                        {snapshot.healthFactorFormatted}x
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium capitalize',
                          hfBandColor(snapshot.riskBand),
                        )}
                      >
                        {snapshot.riskBand} zone
                      </span>
                    </div>

                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          hfBarColor(snapshot.riskBand),
                        )}
                        style={{ width: `${hfGaugePct}%` }}
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 w-px bg-background/80"
                        style={{ left: '16.67%' }}
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-y-0 w-px bg-background/80"
                        style={{ left: '33.33%' }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Liquidation buffer</span>
                      <span className="tabular-financial font-medium text-foreground">
                        -{snapshot.liquidationPriceDropPct}% drop
                      </span>
                    </div>

                    {Number(recommendedRepayUsdc) > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Repaying{' '}
                        <span className="tabular-financial font-medium text-foreground">
                          {recommendedRepayUsdc} USDC
                        </span>{' '}
                        lifts Health Factor cleanly above the 1.60x target buffer.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-20 animate-pulse rounded-[10px] bg-secondary/60" />
                )}
              </div>

              <Separator />

              {/* Collateral vs Debt */}
              {snapshot && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Collateral</div>
                    <div className="mt-0.5 tabular-financial text-base font-semibold tracking-tight text-foreground">
                      ${formatDecimalWithCommas(snapshot.totalCollateralUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Borrowed Debt</div>
                    <div className="mt-0.5 tabular-financial text-base font-semibold tracking-tight text-foreground">
                      ${formatDecimalWithCommas(snapshot.totalDebtUsd)}
                    </div>
                  </div>
                </div>
              )}

              {/* Positions Ledger */}
              {snapshot && (
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Active Blend Positions
                  </div>
                  <div className="divide-y divide-border rounded-[12px] border border-border bg-card">
                    {snapshot.positions.map((pos) => {
                      const isDebt = Number(pos.debtUsd) > 0;
                      return (
                        <div
                          key={`${pos.poolId}-${pos.asset.code}`}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div>
                            <div className="text-xs font-medium text-foreground">
                              {pos.asset.symbol}{' '}
                              <span className="font-normal text-muted-foreground">
                                {isDebt ? 'Debt' : 'Collateral'}
                              </span>
                            </div>
                            <div className="mt-0.5 tabular-financial text-[11px] text-muted-foreground">
                              {isDebt
                                ? `${formatBpsAsPercent(pos.borrowApyBps)} borrow APY`
                                : `${formatBpsAsPercent(pos.supplyApyBps)} supply APY`}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="tabular-financial text-xs font-medium text-foreground">
                              ${formatDecimalWithCommas(isDebt ? pos.debtUsd : pos.collateralUsd)}
                            </div>
                            <div className="tabular-financial text-[11px] text-muted-foreground">
                              {formatDecimalWithCommas(
                                isDebt ? pos.debtFormatted : pos.collateralFormatted,
                              )}{' '}
                              {pos.asset.symbol}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Separator />

              {/* YieldGuardPolicy Summary */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    YieldGuardPolicy
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium',
                      policy.isPaused ? 'text-risk-danger' : 'text-risk-safe',
                    )}
                  >
                    {policy.isPaused ? (
                      <>
                        <ShieldAlert className="size-3.5" />
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

                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max Single Tx</span>
                    <span className="tabular-financial text-foreground">
                      ${atomicStroopsToUsdcNumber(policy.maxSingleTxAmount).toLocaleString()} USDC
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">24h Spend Cap</span>
                    <span className="tabular-financial text-foreground">
                      ${atomicStroopsToUsdcNumber(policy.spentInWindow).toFixed(0)} / $
                      {atomicStroopsToUsdcNumber(policy.dailySpendLimit).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Min HF Floor</span>
                    <span className="tabular-financial text-foreground">
                      {(policy.minHealthFactorBps / 10_000).toFixed(2)}x
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDrawerOpen(true)}
                  className="mt-1 w-full bg-card"
                >
                  Configure Guardrails
                </Button>
              </div>

              <Separator />

              {/* Deterministic Direct Simulations */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Quick Soroban Simulations
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isSimulatingAction || isStreaming}
                  onClick={() =>
                    void handleQuickSimulate({
                      actionType: 'repay_debt',
                      amount: '500.00',
                      targetProtocol: 'blend',
                      userLabel: 'Simulate repaying 500 USDC on Blend to strengthen Health Factor.',
                    })
                  }
                >
                  <ShieldCheck className="size-3.5 text-risk-safe" />
                  <span>Simulate Repay · 500 USDC</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isSimulatingAction || isStreaming}
                  onClick={() =>
                    void handleQuickSimulate({
                      actionType: 'rebalance_vault',
                      amount: '800.00',
                      targetProtocol: 'defindex',
                      userLabel:
                        'Simulate rebalancing 800 USDC into the allowlisted DeFindex Auto-Compound Blend Vault.',
                    })
                  }
                >
                  <TrendingUp className="size-3.5 text-risk-safe" />
                  <span>Simulate DeFindex · 800 USDC</span>
                </Button>
              </div>

              {/* Best Allowlisted DeFindex Yield Reference */}
              {yieldComparison && yieldComparison.quotes[0] && (
                <div className="rounded-[12px] border border-border bg-card px-3.5 py-3 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Top DeFindex Vault</span>
                    <span className="tabular-financial font-medium text-risk-safe">
                      {formatBpsAsPercent(yieldComparison.quotes[0].netApyDeltaBps, true)}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-foreground">
                    {yieldComparison.quotes[0].vaultName}
                  </div>
                  <div className="mt-1 tabular-financial text-[11px] text-muted-foreground">
                    {formatBpsAsPercent(yieldComparison.quotes[0].netApyBps)} net APY · Fee $
                    {yieldComparison.quotes[0].estimatedSorobanFeeUsd}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Center Copilot Column */}
        <section aria-label="HyperDrop AI Copilot" className="min-h-0 flex-1 overflow-hidden">
          <ChatCopilot
            messages={messages}
            isStreaming={isStreaming}
            isSimulatingAction={isSimulatingAction}
            policyPaused={policy.isPaused}
            onSendPrompt={(text) => void handleSendPrompt(text)}
            onQuickSimulateRepay={() =>
              void handleQuickSimulate({
                actionType: 'repay_debt',
                amount: '500.00',
                targetProtocol: 'blend',
                userLabel: 'Simulate repaying 500 USDC on Blend to bring Health Factor above 1.50x.',
              })
            }
            onQuickCompareYields={() => void handleQuickCompareYields()}
            onOpenGuardrails={() => setDrawerOpen(true)}
            onProposalExecuted={handleProposalExecuted}
          />
        </section>
      </main>

      <GuardrailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        policy={policy}
        onPolicyUpdated={(next) => {
          setPolicy(next);
          void loadPortfolio(next, snapshot?.positions);
        }}
      />

      {!hideToaster ? <Toaster /> : null}
    </div>
  );
}

export function HyperDropShell({ onNavigateHome, hideToaster }: HyperDropShellProps = {}) {
  return (
    <TooltipProvider>
      <WalletProvider>
        <HyperDropWorkspace onNavigateHome={onNavigateHome} hideToaster={hideToaster} />
      </WalletProvider>
    </TooltipProvider>
  );
}
