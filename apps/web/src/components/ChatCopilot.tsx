'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  Loader2,
  ShieldOff,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AgentToolTrace,
  CopilotMessage,
  TransactionProposal,
} from '../../../../packages/agent-core/src/types';
import { cn } from '../lib/utils';
import { TxPreviewCard } from './TxPreviewCard';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

export interface ChatCopilotProps {
  readonly messages: readonly CopilotMessage[];
  readonly isStreaming: boolean;
  readonly isSimulatingAction: boolean;
  readonly policyPaused: boolean;
  readonly onSendPrompt: (prompt: string) => void;
  readonly onQuickSimulateRepay: () => void;
  readonly onQuickCompareYields: () => void;
  readonly onOpenGuardrails: () => void;
  readonly onProposalExecuted: (proposal: TransactionProposal, txHash?: string) => void;
}

const TOOL_LABELS: Record<AgentToolTrace['toolName'], string> = {
  get_portfolio_health: 'Blend Portfolio Health',
  compare_defindex_yields: 'DeFindex Net APY Comparison',
  simulate_rebalance_or_repay: 'Soroban Transaction Simulation',
};

export function ChatCopilot({
  messages,
  isStreaming,
  isSimulatingAction,
  policyPaused,
  onSendPrompt,
  onQuickSimulateRepay,
  onQuickCompareYields,
  onOpenGuardrails,
  onProposalExecuted,
}: ChatCopilotProps) {
  const [draft, setDraft] = React.useState('');
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    setDraft('');
    onSendPrompt(trimmed);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Frozen Policy Banner (only visible when Emergency Freeze is active) */}
      {policyPaused && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-risk-danger-border bg-risk-danger-surface px-5 py-2.5 text-xs"
        >
          <div className="flex items-center gap-2 text-risk-danger">
            <ShieldOff className="size-4 shrink-0" />
            <span>
              Emergency Freeze active on YieldGuardPolicy. All agent executions are blocked until
              you sign <span className="tabular-financial font-medium">unpause_guard</span>.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenGuardrails}
            className="min-h-8 h-8 border-risk-danger-border bg-background/60 px-3 text-xs text-foreground"
          >
            Manage Freeze
          </Button>
        </div>
      )}

      {/* Main Message Stream */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="mx-auto w-full max-w-[740px] px-4 sm:px-6 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-8 py-6">
              <div className="flex flex-col gap-2.5">
                <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
                  Non-custodial Stellar DeFi copilot
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Monitor Blend Health Factor risk, compare DeFindex vault yields net of Soroban
                  fees, and simulate guarded transactions before signing in your wallet.
                </p>
              </div>

              {/* Three Focused Action Starters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={onQuickSimulateRepay}
                  disabled={isSimulatingAction || isStreaming}
                  className="flex flex-col items-start justify-between gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <div className="text-sm font-semibold text-foreground">
                    Simulate 500 USDC Repay
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Preflight Blend debt repayment and raise Health Factor into the Safe zone
                    (&gt; 1.50x).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={onQuickCompareYields}
                  disabled={isSimulatingAction || isStreaming}
                  className="flex flex-col items-start justify-between gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <div className="text-sm font-semibold text-foreground">
                    Compare DeFindex Yields
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Rank allowlisted Testnet USDC vaults by deterministic net APY after Soroban
                    fees.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onSendPrompt(
                      'Inspect my Blend Health Factor, explain my liquidation drop risk, and simulate repaying 500 USDC if compliant with YieldGuardPolicy.',
                    )
                  }
                  disabled={isStreaming || isSimulatingAction}
                  className="flex flex-col items-start justify-between gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <div className="text-sm font-semibold text-foreground">
                    Ask HyperDrop Copilot
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Run Gemini risk analysis with deterministic Blend, DeFindex, and Soroban tools.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((msg) => (
                <article
                  key={msg.id}
                  className={cn(
                    'flex flex-col gap-2',
                    msg.role === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] rounded-[14px] border border-border bg-secondary px-4 py-3 text-sm leading-relaxed text-foreground">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full">
                      {/* Tool Execution Trace Steps */}
                      {msg.toolTraces && msg.toolTraces.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1.5">
                          {msg.toolTraces.map((trace) => (
                            <div
                              key={trace.id}
                              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                            >
                              {trace.status === 'running' ? (
                                <Loader2 className="size-3.5 animate-spin text-foreground" />
                              ) : trace.status === 'completed' ? (
                                <CheckCircle2 className="size-3.5 text-risk-safe" />
                              ) : (
                                <AlertCircle className="size-3.5 text-risk-danger" />
                              )}
                              <span className="font-medium text-foreground">
                                {TOOL_LABELS[trace.toolName]}
                              </span>
                              {trace.summary && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-financial">{trace.summary}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Assistant Prose */}
                      {msg.content && (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {msg.content}
                        </div>
                      )}

                      {/* Inline Simulated Transaction Preview Card */}
                      {msg.proposal && (
                        <TxPreviewCard
                          proposal={msg.proposal}
                          onExecuted={onProposalExecuted}
                        />
                      )}
                    </div>
                  )}
                </article>
              ))}

              {(isStreaming || isSimulatingAction) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-foreground" />
                  <span>
                    {isSimulatingAction
                      ? 'Simulating Soroban transaction and checking YieldGuardPolicy…'
                      : 'Running deterministic Stellar risk tools…'}
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Docked Prompt Composer */}
      <div className="border-t border-border bg-background px-4 sm:px-6 py-4">
        <div className="mx-auto w-full max-w-[740px]">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 rounded-[14px] border border-border bg-card p-2 transition-colors focus-within:border-ring"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenGuardrails}
              aria-label="Open YieldGuardPolicy Guardrails"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="size-4" />
            </Button>

            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask HyperDrop to check Blend health, compare DeFindex vaults, or simulate a repay…"
              aria-label="Copilot message input"
              disabled={isStreaming}
              className="min-h-10 flex-1 bg-transparent px-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
            />

            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isStreaming || draft.trim().length === 0}
              aria-label="Send message to HyperDrop Copilot"
            >
              <span>Send</span>
              <ArrowUp className="size-3.5" />
            </Button>
          </form>

          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Non-custodial Stellar Testnet copilot · All transactions simulate via Soroban RPC and
            require your wallet signature.
          </p>
        </div>
      </div>
    </div>
  );
}
