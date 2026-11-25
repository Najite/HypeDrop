'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  Moon,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
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
import { computeDashboardSummary } from '../lib/dashboard-metrics';
import {
  atomicStroopsToUsdcNumber,
  cn,
  formatBpsAsPercent,
} from '../lib/utils';
import { ChatCopilot } from './ChatCopilot';
import { DashboardOverview } from './DashboardOverview';
import { GuardrailDrawer } from './GuardrailDrawer';
import { HyperDropLogoMark } from './LandingVisuals';
import {
  PREVIEW_TESTNET_ADDRESS,
  WalletConnectionControl,
  WalletProvider,
  useWallet,
} from './WalletProvider';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
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

  const [mobileTab, setMobileTab] = React.useState<'overview' | 'copilot'>('overview');
  const [isDark, setIsDark] = React.useState(false);

  // Sync optional Dark Mode toggle cleanly on documentElement
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    return () => {
      root.classList.remove('dark');
    };
  }, [isDark]);

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

  const summary = React.useMemo(
    () => computeDashboardSummary(snapshot, policy, recommendedRepayUsdc),
    [snapshot, policy, recommendedRepayUsdc],
  );

  const handleQuickSimulate = React.useCallback(
    async (params: {
      readonly actionType: 'repay_debt' | 'rebalance_vault';
      readonly amount: string;
      readonly targetProtocol: 'blend' | 'defindex';
      readonly userLabel: string;
    }) => {
      setMobileTab('copilot');
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
                      summary: `${payload.title} · HF ${payload.healthFactor.beforeFormatted}x → ${payload.healthFactor.afterFormatted}x`,
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
    setMobileTab('copilot');
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
        return `• ${q.vaultName}: ${formatBpsAsPercent(q.netApyBps)} net APY (${formatBpsAsPercent(q.netApyDeltaBps, true)} vs Blend · Fee ${q.estimatedSorobanFeeXlm} XLM · ${allowText})`;
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Evaluated DeFindex Testnet USDC vaults for 1,000.00 USDC against Blend supply (${formatBpsAsPercent(data.yields.currentBlendSupplyApyBps)}):\n\n${lines.join('\n')}`,
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Clean Single-Row Top Bar Matching Landing Page */}
      <header className="sticky top-0 z-30 flex h-15 sm:h-16 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-border bg-card/95 px-3 sm:px-6 backdrop-blur-md">
        {/* Zone 1: Unified HyperDrop Logo + Wordmark */}
        {onNavigateHome ? (
          <button
            type="button"
            onClick={onNavigateHome}
            aria-label="HyperDrop — return to landing page"
            className="inline-flex items-center gap-2 text-sm sm:text-base font-bold tracking-tight text-foreground whitespace-nowrap shrink-0 cursor-pointer hover:opacity-85 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <HyperDropLogoMark className="size-7 sm:size-8" />
            <span>HyperDrop</span>
          </button>
        ) : (
          <a
            href="#workspace"
            className="inline-flex items-center gap-2 text-sm sm:text-base font-bold tracking-tight text-foreground whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <HyperDropLogoMark className="size-7 sm:size-8" />
            <span>HyperDrop</span>
          </a>
        )}

        {/* Zone 2: Quiet Unboxed Network Context */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
          <span>Stellar Testnet</span>
          <span aria-hidden="true">·</span>
          <span>Blend Lending</span>
          <span aria-hidden="true">·</span>
          <span>DeFindex Vaults</span>
          <span aria-hidden="true">·</span>
          <span>YieldGuard Soroban</span>
        </div>

        {/* Zone 3: Theme Switch + Guardrails + Wallet Control */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex size-9 sm:size-10 items-center justify-center rounded-xl border border-border bg-surface-inset text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          <Button
            variant={policy.isPaused ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setDrawerOpen(true)}
            aria-label={policy.isPaused ? 'Guard Frozen — open guardrails' : 'Open Guardrails'}
            className={cn(
              'min-h-9 h-9 px-2.5 sm:min-h-10 sm:px-3.5',
              !policy.isPaused && 'bg-card',
            )}
          >
            {policy.isPaused ? (
              <ShieldAlert className="size-4" />
            ) : (
              <SlidersHorizontal className="size-4" />
            )}
            <span className="hidden sm:inline">
              {policy.isPaused ? 'Guard Frozen' : 'Guardrails'}
            </span>
          </Button>

          <WalletConnectionControl />
        </div>
      </header>

      {/* Mobile View Switcher (< lg only, compact and non-sticky to respect 15% sticky cap) */}
      <div className="flex lg:hidden shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
        <div
          role="tablist"
          aria-label="Workspace view"
          className="grid w-full grid-cols-2 gap-1 rounded-xl bg-surface-inset p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'overview'}
            onClick={() => setMobileTab('overview')}
            className={cn(
              'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
              mobileTab === 'overview'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutDashboard className="size-3.5" />
            <span>Overview</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'copilot'}
            onClick={() => setMobileTab('copilot')}
            className={cn(
              'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
              mobileTab === 'copilot'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Sparkles className="size-3.5" />
            <span>AI Copilot</span>
            {messages.length > 0 && (
              <span className="tabular-financial text-[11px] text-primary">
                ({messages.filter((m) => m.role === 'assistant').length})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Overview-First + Docked Copilot Split Workspace */}
      <main
        id="workspace"
        className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_410px] xl:grid-cols-[minmax(0,1fr)_450px] overflow-hidden"
      >
        {/* Left/Center Main Column: Live Consumer-Fintech Overview Dashboard */}
        <section
          aria-label="Portfolio Overview Dashboard"
          className={cn(
            'min-h-0 flex-1 overflow-hidden bg-background',
            mobileTab === 'copilot' ? 'hidden lg:block' : 'block',
          )}
        >
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-[960px]">
              <DashboardOverview
                snapshot={snapshot}
                policy={policy}
                yieldComparison={yieldComparison}
                recommendedRepayUsdc={recommendedRepayUsdc}
                isLoading={isLoadingPortfolio}
                isBusy={isSimulatingAction || isStreaming}
                onRefresh={() => void loadPortfolio(policy, snapshot?.positions)}
                onSimulateRepay={(amount = '500.00') =>
                  void handleQuickSimulate({
                    actionType: 'repay_debt',
                    amount,
                    targetProtocol: 'blend',
                    userLabel: `Simulate repaying ${amount} USDC on Blend to strengthen Health Factor.`,
                  })
                }
                onSimulateDeFindex={(amount = '800.00', vaultName) =>
                  void handleQuickSimulate({
                    actionType: 'rebalance_vault',
                    amount,
                    targetProtocol: 'defindex',
                    userLabel: vaultName
                      ? `Simulate depositing ${amount} USDC into ${vaultName}.`
                      : `Simulate rebalancing ${amount} USDC into the allowlisted DeFindex Auto-Compound Blend Vault.`,
                  })
                }
                onCompareYields={() => void handleQuickCompareYields()}
                onOpenGuardrails={() => setDrawerOpen(true)}
              />
            </div>
          </ScrollArea>
        </section>

        {/* Right Docked Column: AI Risk Copilot & Inline Simulated Previews */}
        <aside
          aria-label="HyperDrop AI Risk Copilot"
          className={cn(
            'min-h-0 flex-1 overflow-hidden lg:border-l border-border bg-card',
            mobileTab === 'overview' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col',
          )}
        >
          <ChatCopilot
            messages={messages}
            isStreaming={isStreaming}
            isSimulatingAction={isSimulatingAction}
            policyPaused={policy.isPaused}
            insight={summary.insight}
            onSendPrompt={(text) => void handleSendPrompt(text)}
            onQuickSimulateRepay={() =>
              void handleQuickSimulate({
                actionType: 'repay_debt',
                amount: '500.00',
                targetProtocol: 'blend',
                userLabel:
                  'Simulate repaying 500 USDC on Blend to bring Health Factor above 1.50x.',
              })
            }
            onQuickCompareYields={() => void handleQuickCompareYields()}
            onOpenGuardrails={() => setDrawerOpen(true)}
            onResetChat={() => setMessages([])}
            onProposalExecuted={handleProposalExecuted}
          />
        </aside>
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
