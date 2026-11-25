'use client';

import * as React from 'react';
import { Check, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  classifyHealthRisk,
  type SorobanContractId,
  type YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';
import {
  DEFAULT_YIELD_GUARD_CONTRACT_ID,
  buildPauseGuardTx,
  buildUnpauseGuardTx,
  buildUpdateRulesTx,
  submitSignedXdrToTestnet,
} from '../lib/stellar';
import {
  atomicStroopsToUsdcNumber,
  cn,
  truncateAddress,
  usdcNumberToAtomicStroops,
} from '../lib/utils';
import { useWallet } from './WalletProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Slider } from './ui/slider';

export interface KnownProtocolOption {
  readonly id: SorobanContractId;
  readonly name: string;
  readonly category: string;
}

export const KNOWN_TESTNET_PROTOCOLS: readonly KnownProtocolOption[] = [
  {
    id: 'CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65',
    name: 'Blend Yield Pool v2',
    category: 'Lending & Borrowing',
  },
  {
    id: 'CAFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQX4KO',
    name: 'DeFindex USDC Auto-Compound',
    category: 'Yield Vault',
  },
  {
    id: 'CAGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAZTCD',
    name: 'DeFindex USDC Balanced Vault',
    category: 'Yield Vault',
  },
  {
    id: 'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS',
    name: 'Soroswap Router',
    category: 'DEX Aggregator',
  },
];

export interface GuardrailDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly policy: YieldGuardPolicy;
  readonly onPolicyUpdated: (nextPolicy: YieldGuardPolicy) => void;
}

export function GuardrailDrawer({
  open,
  onOpenChange,
  policy,
  onPolicyUpdated,
}: GuardrailDrawerProps) {
  const { address, signTransaction } = useWallet();

  const [singleCap, setSingleCap] = React.useState<number>(() =>
    atomicStroopsToUsdcNumber(policy.maxSingleTxAmount),
  );
  const [dailyCap, setDailyCap] = React.useState<number>(() =>
    atomicStroopsToUsdcNumber(policy.dailySpendLimit),
  );
  const [minHfBps, setMinHfBps] = React.useState<number>(policy.minHealthFactorBps);
  const [allowedProtocols, setAllowedProtocols] = React.useState<string[]>([
    ...policy.allowedProtocols,
  ]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isFreezing, setIsFreezing] = React.useState(false);

  React.useEffect(() => {
    setSingleCap(atomicStroopsToUsdcNumber(policy.maxSingleTxAmount));
    setDailyCap(atomicStroopsToUsdcNumber(policy.dailySpendLimit));
    setMinHfBps(policy.minHealthFactorBps);
    setAllowedProtocols([...policy.allowedProtocols]);
  }, [policy]);

  const spentUsdc = atomicStroopsToUsdcNumber(policy.spentInWindow);
  const dailyUtilPct = dailyCap > 0 ? Math.min(100, Math.round((spentUsdc / dailyCap) * 100)) : 100;
  const hfBand = classifyHealthRisk(minHfBps);
  const validationError =
    singleCap <= 0 || dailyCap <= 0
      ? 'Spend caps must be strictly positive.'
      : singleCap > dailyCap
        ? 'Single-transaction cap cannot exceed the 24-hour rolling spend limit.'
        : allowedProtocols.length === 0
          ? 'At least one Soroban protocol contract must remain allowlisted.'
          : null;

  const toggleProtocol = (id: SorobanContractId) => {
    setAllowedProtocols((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSaveRules = async () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!address) {
      toast.error('Connect a Stellar Testnet wallet to sign rule updates.');
      return;
    }

    setIsSaving(true);
    try {
      const nextPolicy: YieldGuardPolicy = {
        ...policy,
        owner: address,
        maxSingleTxAmount: usdcNumberToAtomicStroops(singleCap),
        dailySpendLimit: usdcNumberToAtomicStroops(dailyCap),
        minHealthFactorBps: minHfBps,
        allowedProtocols,
      };

      const built = await buildUpdateRulesTx(
        {
          owner: nextPolicy.owner,
          agentSigner: nextPolicy.agentSigner,
          maxSingleTxAmount: nextPolicy.maxSingleTxAmount,
          dailySpendLimit: nextPolicy.dailySpendLimit,
          minHealthFactorBps: nextPolicy.minHealthFactorBps,
          allowedProtocols: nextPolicy.allowedProtocols,
        },
        DEFAULT_YIELD_GUARD_CONTRACT_ID,
      );

      const { signedTxXdr, simulatedPreview } = await signTransaction(
        built.unsignedXdr,
        built.networkPassphrase,
      );

      if (!simulatedPreview && built.simulated) {
        const res = await submitSignedXdrToTestnet(signedTxXdr);
        toast.success('On-chain YieldGuardPolicy rules updated', {
          description: `Tx ${truncateAddress(res.hash, 8, 6)} · Status: ${res.status}`,
        });
      } else {
        toast.success('YieldGuardPolicy rules updated for session', {
          description: `Max Tx $${singleCap.toLocaleString()} · 24h Cap $${dailyCap.toLocaleString()} · Min HF ${(minHfBps / 10_000).toFixed(2)}x`,
        });
      }

      onPolicyUpdated(nextPolicy);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to update YieldGuardPolicy rules', {
        description: err instanceof Error ? err.message : 'Unexpected signing error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFreeze = async () => {
    if (!address) {
      toast.error('Connect a Stellar Testnet wallet to invoke pause_guard.');
      return;
    }

    const nextPaused = !policy.isPaused;
    setIsFreezing(true);
    try {
      const built = nextPaused
        ? await buildPauseGuardTx(address, DEFAULT_YIELD_GUARD_CONTRACT_ID)
        : await buildUnpauseGuardTx(address, DEFAULT_YIELD_GUARD_CONTRACT_ID);

      const { signedTxXdr, simulatedPreview } = await signTransaction(
        built.unsignedXdr,
        built.networkPassphrase,
      );

      if (!simulatedPreview && built.simulated) {
        await submitSignedXdrToTestnet(signedTxXdr);
      }

      onPolicyUpdated({
        ...policy,
        isPaused: nextPaused,
      });

      if (nextPaused) {
        toast.error('Emergency Freeze activated (pause_guard)', {
          description:
            'All agent transaction proposals are now blocked until you sign unpause_guard.',
        });
      } else {
        toast.success('Emergency Freeze lifted (unpause_guard)', {
          description: 'YieldGuardPolicy resumed enforcing normal spend and Health Factor caps.',
        });
      }
    } catch (err) {
      toast.error(nextPaused ? 'Failed to freeze agent' : 'Failed to unpause agent', {
        description: err instanceof Error ? err.message : 'Unexpected signing error',
      });
    } finally {
      setIsFreezing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <SheetHeader className="border-b border-border">
          <div className="flex items-center justify-between pr-10">
            <SheetTitle>YieldGuardPolicy Guardrails</SheetTitle>
            <Badge variant={policy.isPaused ? 'danger' : 'safe'}>
              {policy.isPaused ? (
                <>
                  <ShieldOff className="size-3" />
                  <span>Frozen</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3" />
                  <span>Active</span>
                </>
              )}
            </Badge>
          </div>
          <SheetDescription>
            Non-custodial Soroban spending caps and Health Factor floors enforced on-chain before
            any agent action can settle.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 px-6 py-5">
            {/* 24h Spend Window Status */}
            <div className="rounded-[12px] border border-border bg-surface-inset p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">24-hour window utilization</span>
                <span
                  className={cn(
                    'tabular-financial font-medium',
                    dailyUtilPct >= 90
                      ? 'text-risk-danger'
                      : dailyUtilPct >= 70
                        ? 'text-risk-caution'
                        : 'text-foreground',
                  )}
                >
                  ${spentUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $
                  {dailyCap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({dailyUtilPct}%)
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-200',
                    dailyUtilPct >= 90
                      ? 'bg-risk-danger'
                      : dailyUtilPct >= 70
                        ? 'bg-risk-caution'
                        : 'bg-risk-safe',
                  )}
                  style={{ width: `${dailyUtilPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Contract</span>
                <span className="tabular-financial">
                  {truncateAddress(DEFAULT_YIELD_GUARD_CONTRACT_ID, 8, 6)}
                </span>
              </div>
            </div>

            {/* Single-Tx Spend Cap */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="single-tx-cap-input"
                  className="text-sm font-medium text-foreground"
                >
                  Max Single-Transaction Cap
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="single-tx-cap-input"
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={singleCap}
                    onChange={(e) => setSingleCap(Math.max(0, Number(e.target.value)))}
                    className="w-28 text-right tabular-financial"
                  />
                  <span className="text-xs font-medium text-muted-foreground">USDC</span>
                </div>
              </div>
              <Slider
                aria-label="Max Single-Transaction Cap"
                min={100}
                max={5000}
                step={50}
                value={[Math.min(5000, Math.max(100, singleCap))]}
                onValueChange={([v]) => {
                  if (v !== undefined) {
                    setSingleCap(v);
                    if (v > dailyCap) {
                      setDailyCap(v);
                    }
                  }
                }}
              />
              <div className="flex justify-between text-[11px] tabular-financial text-muted-foreground">
                <span>$100</span>
                <span>$2,500</span>
                <span>$5,000</span>
              </div>
            </div>

            {/* 24h Rolling Spend Limit */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="daily-spend-limit-input"
                  className="text-sm font-medium text-foreground"
                >
                  24-Hour Rolling Spend Limit
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="daily-spend-limit-input"
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={dailyCap}
                    onChange={(e) => setDailyCap(Math.max(0, Number(e.target.value)))}
                    className="w-28 text-right tabular-financial"
                  />
                  <span className="text-xs font-medium text-muted-foreground">USDC</span>
                </div>
              </div>
              <Slider
                aria-label="24-Hour Rolling Spend Limit"
                min={250}
                max={10000}
                step={100}
                value={[Math.min(10000, Math.max(250, dailyCap))]}
                onValueChange={([v]) => {
                  if (v !== undefined) {
                    setDailyCap(v);
                    if (singleCap > v) {
                      setSingleCap(v);
                    }
                  }
                }}
              />
              <div className="flex justify-between text-[11px] tabular-financial text-muted-foreground">
                <span>$250</span>
                <span>$5,000</span>
                <span>$10,000</span>
              </div>
            </div>

            {/* Minimum Health Factor Floor */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-foreground">
                  Minimum Health Factor Floor
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'tabular-financial text-base font-semibold tracking-tight',
                      hfBand === 'safe' && 'text-risk-safe',
                      hfBand === 'caution' && 'text-risk-caution',
                      hfBand === 'danger' && 'text-risk-danger',
                    )}
                  >
                    {(minHfBps / 10_000).toFixed(2)}x
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">{hfBand}</span>
                </div>
              </div>
              <Slider
                aria-label="Minimum Health Factor Floor"
                min={11_000}
                max={25_000}
                step={500}
                value={[minHfBps]}
                onValueChange={([v]) => {
                  if (v !== undefined) {
                    setMinHfBps(v);
                  }
                }}
              />
              <div className="flex justify-between text-[11px] tabular-financial text-muted-foreground">
                <span>1.10x Danger</span>
                <span>1.50x Threshold</span>
                <span>2.50x Conservative</span>
              </div>
            </div>

            <Separator />

            {/* Allowlisted Protocols */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Allowlisted Contracts</span>
                <span className="tabular-financial text-xs text-muted-foreground">
                  {allowedProtocols.length} enabled
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {KNOWN_TESTNET_PROTOCOLS.map((proto) => {
                  const checked = allowedProtocols.includes(proto.id);
                  return (
                    <button
                      key={proto.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleProtocol(proto.id)}
                      className={cn(
                        'flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        checked
                          ? 'border-risk-safe-border bg-surface-inset text-foreground'
                          : 'border-border bg-transparent text-muted-foreground hover:bg-accent/40',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{proto.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{proto.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-financial">{truncateAddress(proto.id, 6, 4)}</span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                          checked
                            ? 'border-risk-safe bg-risk-safe-surface text-risk-safe'
                            : 'border-border bg-transparent',
                        )}
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {validationError && (
              <div
                role="alert"
                className="rounded-[10px] border border-risk-danger-border bg-risk-danger-surface px-3.5 py-2.5 text-xs text-risk-danger"
              >
                {validationError}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="gap-2.5 bg-surface-inset/80">
          <Button
            variant="default"
            className="w-full"
            onClick={() => void handleSaveRules()}
            disabled={isSaving || Boolean(validationError)}
          >
            {isSaving ? 'Preparing update_rules…' : 'Save Guardrail Rules · update_rules'}
          </Button>

          {policy.isPaused ? (
            <Button
              variant="safe"
              className="w-full"
              onClick={() => void handleToggleFreeze()}
              disabled={isFreezing}
            >
              <ShieldCheck className="size-4" />
              <span>{isFreezing ? 'Lifting Freeze…' : 'Lift Emergency Freeze · unpause_guard'}</span>
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={isFreezing}>
                  <ShieldOff className="size-4" />
                  <span>Emergency Freeze Agent</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Freeze HyperDrop Agent on Soroban?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This prepares a{' '}
                    <span className="tabular-financial text-foreground">pause_guard</span>{' '}
                    invocation for your owner address. All pending and future agent actions will
                    be rejected on-chain until you explicitly sign{' '}
                    <span className="tabular-financial text-foreground">unpause_guard</span>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleToggleFreeze()}>
                    Confirm Freeze · pause_guard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
