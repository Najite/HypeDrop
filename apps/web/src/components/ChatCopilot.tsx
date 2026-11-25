'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  AgentToolTrace,
  CopilotMessage,
  TransactionProposal,
} from '../../../../packages/agent-core/src/types';
import type { ProactiveInsight } from '../lib/dashboard-metrics';
import { cn } from '../lib/utils';
import { TxPreviewCard } from './TxPreviewCard';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

export interface ChatCopilotProps {
  readonly messages: readonly CopilotMessage[];
  readonly isStreaming: boolean;
  readonly isSimulatingAction: boolean;
  readonly policyPaused: boolean;
  readonly insight: ProactiveInsight;
  readonly onSendPrompt: (prompt: string) => void;
  readonly onQuickSimulateRepay: () => void;
  readonly onQuickCompareYields: () => void;
  readonly onOpenGuardrails: () => void;
  readonly onResetChat: () => void;
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
  insight,
  onSendPrompt,
  onQuickSimulateRepay,
  onQuickCompareYields,
  onOpenGuardrails,
  onResetChat,
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

  const handleInsightAction = () => {
    if (insight.actionKind === 'repay') {
      onQuickSimulateRepay();
    } else if (insight.actionKind === 'unfreeze') {
      onOpenGuardrails();
    } else {
      onQuickCompareYields();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Docked Copilot Panel Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#F1ECFF] text-[#6D4AFF] dark:bg-violet-500/18 dark:text-violet-300">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              AI Risk Copilot
            </h2>
            <div className="truncate text-[11px] text-muted-foreground">
              Deterministic Soroban previews · Non-custodial
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={onResetChat}
            disabled={isStreaming || isSimulatingAction}
            aria-label="Reset copilot conversation"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main Message Stream */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4">
              {/* Proactive AI Risk Insight Card (Echoes Hero Floating Insight Card) */}
              <div
                className={cn(
                  'rounded-2xl border p-4',
                  insight.severity === 'frozen' || insight.severity === 'danger'
                    ? 'border-risk-danger-border bg-risk-danger-surface/65'
                    : insight.severity === 'caution'
                      ? 'border-risk-caution-border bg-risk-caution-surface/75'
                      : 'border-risk-safe-border bg-risk-safe-surface/65',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-card',
                      insight.severity === 'frozen' || insight.severity === 'danger'
                        ? 'text-risk-danger'
                        : insight.severity === 'caution'
                          ? 'text-risk-caution'
                          : 'text-risk-safe',
                    )}
                  >
                    {insight.severity === 'frozen' ? (
                      <ShieldOff className="size-4" />
                    ) : insight.severity === 'danger' || insight.severity === 'caution' ? (
                      <ShieldAlert className="size-4" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Live AI Risk Insight
                    </div>
                    <h3 className="mt-0.5 text-sm font-semibold text-foreground">
                      {insight.headline}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {insight.detail}
                    </p>
                    <Button
                      variant={
                        insight.severity === 'frozen' || insight.severity === 'danger'
                          ? 'destructive'
                          : 'default'
                      }
                      size="sm"
                      disabled={isSimulatingAction || isStreaming}
                      onClick={handleInsightAction}
                      className="mt-3 w-full"
                    >
                      <span>{insight.primaryActionLabel}</span>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Clean Plain-English Starter Prompts */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Suggested questions
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onSendPrompt(
                      'Inspect my Blend Health Factor, explain my liquidation drop risk, and simulate repaying 500 USDC if compliant with YieldGuardPolicy.',
                    )
                  }
                  disabled={isStreaming || isSimulatingAction}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <span>Explain my liquidation risk &amp; simulate a safe repay</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={onQuickCompareYields}
                  disabled={isStreaming || isSimulatingAction}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <span>Compare DeFindex USDC vaults after Stellar fees</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onSendPrompt(
                      'Summarize my current YieldGuardPolicy spending caps and allowlisted Soroban protocols.',
                    )
                  }
                  disabled={isStreaming || isSimulatingAction}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface-inset px-3.5 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
                >
                  <span>Audit my active YieldGuard spending caps</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((msg) => (
                <article
                  key={msg.id}
                  className={cn(
                    'flex flex-col gap-2',
                    msg.role === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed text-primary-foreground">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="w-full">
                      {/* Tool Execution Trace Steps */}
                      {msg.toolTraces && msg.toolTraces.length > 0 && (
                        <div className="mb-2.5 flex flex-col gap-1.5">
                          {msg.toolTraces.map((trace) => (
                            <div
                              key={trace.id}
                              className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
                            >
                              {trace.status === 'running' ? (
                                <Loader2 className="size-3.5 animate-spin text-primary" />
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
                        <div className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-foreground">
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
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>
                    {isSimulatingAction
                      ? 'Simulating Soroban transaction & checking YieldGuard…'
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
      <div className="shrink-0 border-t border-border bg-card px-4 py-3.5 sm:px-5">
        {policyPaused && (
          <div className="mb-2 flex items-center justify-between text-[11px] text-risk-danger">
            <span>Emergency Freeze active · signing disabled</span>
            <button
              type="button"
              onClick={onOpenGuardrails}
              className="font-semibold underline underline-offset-2 cursor-pointer"
            >
              Unfreeze
            </button>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border border-border bg-surface-inset p-1.5 transition-colors focus-within:border-primary focus-within:bg-card"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenGuardrails}
            aria-label="Open YieldGuardPolicy Guardrails"
            className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
          </Button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about Blend risk, yields, or a repay…"
            aria-label="Copilot message input"
            disabled={isStreaming}
            className="min-h-9 flex-1 bg-transparent px-1 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
          />

          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={isStreaming || draft.trim().length === 0}
            aria-label="Send message to HyperDrop Copilot"
            className="min-h-9 rounded-xl px-3"
          >
            <span>Send</span>
            <ArrowUp className="size-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
