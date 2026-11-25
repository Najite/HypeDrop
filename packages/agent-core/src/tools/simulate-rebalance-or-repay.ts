import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk';
import { z } from 'zod';
import {
  atomicToDecimal,
  computeNetApyAfterSorobanFees,
  decimalToAtomic,
  evaluateYieldGuardPolicy,
  formatDecimal,
  simulatePostActionHealthFactor,
} from '../math/risk';
import {
  STELLAR_ASSET_DECIMALS,
  TRANSACTION_PROPOSAL_SCHEMA_VERSION,
  isTransactionProposal,
  isValidSorobanContractId,
  isValidStellarPublicKey,
  type BlendPosition,
  type ProposalActionType,
  type SorobanContractId,
  type SorobanSimulationSummary,
  type TokenBalanceDiff,
  type TransactionProposal,
  type YieldGuardPolicy,
} from '../types';
import {
  DEFAULT_TESTNET_CONTRACTS,
  createSorobanRpcAdapter,
  getStellarProtocolRegistry,
  loadBlendTestnetPositions,
  resolveYieldGuardPolicy,
  scValAddress,
  scValI128,
  scValU32,
  type SorobanRpcAdapter,
} from './stellar-context';

export const simulateRebalanceOrRepayInputSchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Must be a valid Stellar Ed25519 G... public key'),
  actionType: z.enum(['repay_debt', 'add_collateral', 'rebalance_vault', 'swap_and_repay']),
  assetCode: z.enum(['USDC', 'XLM', 'EURC']).default('USDC'),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'Amount must be a positive decimal string (up to 7 decimals)')
    .refine((val) => new Decimal(val).gt(0), 'Amount must be greater than zero'),
  targetProtocol: z.enum(['blend', 'defindex', 'soroswap']).default('blend'),
  targetContractId: z
    .string()
    .refine(isValidSorobanContractId, 'Must be a valid Soroban C... contract ID')
    .optional(),
  swapFromAssetCode: z.enum(['USDC', 'XLM', 'EURC']).optional(),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
});

export type SimulateRebalanceOrRepayInput = z.input<
  typeof simulateRebalanceOrRepayInputSchema
>;

export interface SimulateRebalanceOrRepayDeps {
  readonly policySnapshot?: YieldGuardPolicy;
  readonly positionsOverride?: readonly BlendPosition[];
  readonly rpcAdapter?: SorobanRpcAdapter;
  readonly fetchImpl?: typeof fetch;
  readonly nowUnixSec?: number;
}

function resolveTargetContractId(
  targetProtocol: 'blend' | 'defindex' | 'soroswap',
  assetCode: 'USDC' | 'XLM' | 'EURC',
  explicitId: SorobanContractId | undefined,
  registry: ReturnType<typeof getStellarProtocolRegistry>,
): SorobanContractId {
  if (explicitId) {
    return explicitId;
  }
  if (targetProtocol === 'blend') {
    return registry.blendPoolContractId;
  }
  if (targetProtocol === 'soroswap') {
    return registry.soroswapRouterContractId;
  }
  return assetCode === 'XLM'
    ? DEFAULT_TESTNET_CONTRACTS.DEFINDEX_XLM_YIELD_VAULT
    : DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT;
}

function buildActionMetadata(
  actionType: Extract<
    ProposalActionType,
    'repay_debt' | 'add_collateral' | 'rebalance_vault' | 'swap_and_repay'
  >,
  amountFormatted: string,
  assetSymbol: string,
  guardStatus: 'compliant' | 'blocked' | 'paused',
): { readonly title: string; readonly ctaLabel: string } {
  const titles: Record<typeof actionType, string> = {
    repay_debt: `Repay Blend ${assetSymbol} Debt`,
    add_collateral: `Supply ${assetSymbol} Collateral to Blend`,
    rebalance_vault: `Rebalance ${assetSymbol} into DeFindex Vault`,
    swap_and_repay: `Swap & Repay Blend ${assetSymbol} Debt`,
  };

  if (guardStatus === 'paused') {
    return {
      title: titles[actionType],
      ctaLabel: 'Guard Frozen — Unpause Required',
    };
  }
  if (guardStatus === 'blocked') {
    return {
      title: titles[actionType],
      ctaLabel: 'Blocked by YieldGuardPolicy',
    };
  }

  const verbs: Record<typeof actionType, string> = {
    repay_debt: 'Repay',
    add_collateral: 'Supply',
    rebalance_vault: 'Rebalance',
    swap_and_repay: 'Swap & Repay',
  };

  return {
    title: titles[actionType],
    ctaLabel: `Approve & Sign ${verbs[actionType]} · ${amountFormatted} ${assetSymbol}`,
  };
}

export async function simulateRebalanceOrRepay(
  rawInput: SimulateRebalanceOrRepayInput,
  deps: SimulateRebalanceOrRepayDeps = {},
): Promise<TransactionProposal> {
  const input = simulateRebalanceOrRepayInputSchema.parse(rawInput);
  const registry = getStellarProtocolRegistry(input.network);
  const rpcAdapter = deps.rpcAdapter ?? createSorobanRpcAdapter(registry.sorobanRpcUrl);

  const asset = registry.assets[input.assetCode];
  const targetContractId = resolveTargetContractId(
    input.targetProtocol,
    input.assetCode,
    input.targetContractId,
    registry,
  );

  const [positions, policy] = await Promise.all([
    deps.positionsOverride
      ? Promise.resolve(deps.positionsOverride)
      : loadBlendTestnetPositions({
          owner: input.walletAddress,
          registry,
          fetchImpl: deps.fetchImpl,
        }),
    resolveYieldGuardPolicy({
      owner: input.walletAddress,
      registry,
      policySnapshot: deps.policySnapshot,
      rpcAdapter,
    }),
  ]);

  const amountDec = new Decimal(input.amount);
  const amountAtomic = decimalToAtomic(amountDec, asset.decimals);
  const amountFormatted = formatDecimal(amountDec, 2);
  const amountUsd = formatDecimal(amountDec.mul(new Decimal(asset.usdPrice)), 2);

  // 1. Deterministic post-action Blend Health Factor projection
  const healthFactor = simulatePostActionHealthFactor(positions, {
    kind: input.actionType,
    assetCode: asset.code,
    amountAtomic,
    usdPrice: asset.usdPrice,
    decimals: asset.decimals,
  });

  // 2. Deterministic YieldGuardPolicy guardrail evaluation
  const guardrail = evaluateYieldGuardPolicy({
    policy,
    policyContractId: registry.yieldGuardContractId,
    targetProtocolContractId: targetContractId,
    amountAtomic,
    assetSymbol: asset.symbol,
    assetDecimals: asset.decimals,
    projectedHealthFactorBps: healthFactor.afterBps,
    nowUnixSec: deps.nowUnixSec,
  });

  // 3. Build unsigned Soroban transaction via @stellar/stellar-sdk v17.4+
  const warnings: string[] = [];
  let sourceAccount: Account;
  try {
    sourceAccount = await rpcAdapter.getAccount(input.walletAddress);
  } catch {
    sourceAccount = new Account(input.walletAddress, '0');
    warnings.push(
      'Source account was not found on Stellar Testnet RPC; built unsigned preview XDR using sequence 0 (fund via Friendbot before submitting).',
    );
  }

  const guardContract = new Contract(registry.yieldGuardContractId);
  const rawTx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: registry.networkPassphrase,
  })
    .addOperation(
      guardContract.call(
        'validate_and_record_execution',
        scValAddress(input.walletAddress),
        scValAddress(input.walletAddress),
        scValAddress(targetContractId),
        scValI128(amountAtomic),
        scValU32(healthFactor.afterBps),
      ),
    )
    .setTimeout(300)
    .build();

  let unsignedXdr = rawTx.toXDR();
  let simulation: SorobanSimulationSummary;
  const simulatedAt = new Date((deps.nowUnixSec ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  // 4. Preflight simulate via Soroban RPC
  try {
    const simResponse = await rpcAdapter.simulateTransaction(rawTx);
    if (rpc.Api.isSimulationSuccess(simResponse)) {
      const assembled = rpc.assembleTransaction(rawTx, simResponse).build();
      unsignedXdr = assembled.toXDR();

      const minResourceFee = BigInt(simResponse.minResourceFee || '0');
      const recommendedFee = BigInt(BASE_FEE) + minResourceFee;
      const feeXlmDec = atomicToDecimal(recommendedFee, STELLAR_ASSET_DECIMALS);
      const feeUsdDec = feeXlmDec.mul(new Decimal(registry.assets.XLM.usdPrice));

      // Extract Soroban resource instructions/footprint metrics from transactionData (v17.4+)
      const txData = simResponse.transactionData.build();
      const { instructions, diskReadBytes, writeBytes } = txData.resources;

      simulation = {
        status: 'verified',
        simulatedAt,
        rpcUrl: registry.sorobanRpcUrl,
        minResourceFeeStroops: minResourceFee.toString(),
        recommendedFeeStroops: recommendedFee.toString(),
        recommendedFeeXlm: formatDecimal(feeXlmDec, 7),
        recommendedFeeUsd: formatDecimal(feeUsdDec, 4),
        cpuInstructions: Number(instructions),
        readBytes: Number(diskReadBytes),
        writeBytes: Number(writeBytes),
        latestLedger: simResponse.latestLedger,
      };
    } else {
      const errorMsg = rpc.Api.isSimulationError(simResponse)
        ? simResponse.error
        : 'Soroban simulation did not succeed (restoration or host rejection required).';
      const fallbackFee = BigInt(BASE_FEE) + 150_000n;
      const feeXlmDec = atomicToDecimal(fallbackFee, STELLAR_ASSET_DECIMALS);
      const feeUsdDec = feeXlmDec.mul(new Decimal(registry.assets.XLM.usdPrice));

      const friendlyWarning = errorMsg.includes('MissingValue')
        ? 'YieldGuardPolicy contract is not yet deployed at the default Testnet ID; built unsigned XDR with conservative Soroban resource fee estimates.'
        : `Soroban RPC simulation returned an error: ${errorMsg}`;
      warnings.push(friendlyWarning);
      simulation = {
        status: 'failed',
        simulatedAt,
        rpcUrl: registry.sorobanRpcUrl,
        minResourceFeeStroops: '0',
        recommendedFeeStroops: fallbackFee.toString(),
        recommendedFeeXlm: formatDecimal(feeXlmDec, 7),
        recommendedFeeUsd: formatDecimal(feeUsdDec, 4),
        cpuInstructions: 0,
        readBytes: 0,
        writeBytes: 0,
        latestLedger: simResponse.latestLedger ?? 0,
        errorMessage: errorMsg,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach Soroban RPC endpoint';
    const fallbackFee = BigInt(BASE_FEE) + 150_000n;
    const feeXlmDec = atomicToDecimal(fallbackFee, STELLAR_ASSET_DECIMALS);
    const feeUsdDec = feeXlmDec.mul(new Decimal(registry.assets.XLM.usdPrice));

    warnings.push(`Soroban RPC simulation unavailable: ${message}`);
    simulation = {
      status: 'failed',
      simulatedAt,
      rpcUrl: registry.sorobanRpcUrl,
      minResourceFeeStroops: '0',
      recommendedFeeStroops: fallbackFee.toString(),
      recommendedFeeXlm: formatDecimal(feeXlmDec, 7),
      recommendedFeeUsd: formatDecimal(feeUsdDec, 4),
      cpuInstructions: 0,
      readBytes: 0,
      writeBytes: 0,
      latestLedger: 0,
      errorMessage: message,
    };
  }

  // 5. Build deterministic token balance diffs
  const tokenDiffs: TokenBalanceDiff[] = [];
  if (input.actionType === 'swap_and_repay') {
    const fromCode = input.swapFromAssetCode ?? 'XLM';
    const fromAsset = registry.assets[fromCode];
    const fromUnits = new Decimal(amountUsd).div(new Decimal(fromAsset.usdPrice));
    tokenDiffs.push({
      asset: fromAsset,
      direction: 'outflow',
      amountAtomic: decimalToAtomic(fromUnits, fromAsset.decimals),
      amountFormatted: formatDecimal(fromUnits, 2),
      usdValue: amountUsd,
      counterpartyProtocol: 'soroswap',
      counterpartyContractId: registry.soroswapRouterContractId,
    });
    tokenDiffs.push({
      asset,
      direction: 'inflow',
      amountAtomic,
      amountFormatted,
      usdValue: amountUsd,
      counterpartyProtocol: 'blend',
      counterpartyContractId: targetContractId,
    });
  } else if (input.actionType === 'rebalance_vault') {
    tokenDiffs.push({
      asset,
      direction: 'outflow',
      amountAtomic,
      amountFormatted,
      usdValue: amountUsd,
      counterpartyProtocol: 'defindex',
      counterpartyContractId: targetContractId,
    });
    tokenDiffs.push({
      asset: {
        ...asset,
        code: `df${asset.code}`,
        symbol: `df${asset.symbol}`,
        contractId: targetContractId,
      },
      direction: 'inflow',
      amountAtomic,
      amountFormatted,
      usdValue: amountUsd,
      counterpartyProtocol: 'defindex',
      counterpartyContractId: targetContractId,
    });
  } else {
    tokenDiffs.push({
      asset,
      direction: 'outflow',
      amountAtomic,
      amountFormatted,
      usdValue: amountUsd,
      counterpartyProtocol: input.targetProtocol,
      counterpartyContractId: targetContractId,
    });
  }

  // 6. Optional Net APY delta calculation for yield rebalancing
  let netApyDeltaBps: number | undefined;
  if (input.actionType === 'rebalance_vault') {
    const netYield = computeNetApyAfterSorobanFees({
      principalUsd: amountUsd,
      currentApyBps: 540,
      targetGrossApyBps: 845,
      protocolFeeBps: 500,
      sorobanFeeStroops: simulation.recommendedFeeStroops,
      xlmUsdPrice: registry.assets.XLM.usdPrice,
      horizonDays: 90,
    });
    netApyDeltaBps = netYield.netApyDeltaBps;
  }

  const { title, ctaLabel } = buildActionMetadata(
    input.actionType,
    amountFormatted,
    asset.symbol,
    guardrail.status,
  );

  const summary =
    input.actionType === 'rebalance_vault'
      ? `Rebalancing ${amountFormatted} ${asset.symbol} into DeFindex delivers an estimated +${((netApyDeltaBps ?? 0) / 100).toFixed(2)}% net APY delta after Soroban fees while keeping your Blend Health Factor at ${healthFactor.afterFormatted}x.`
      : `Executing ${title.toLowerCase()} (${amountFormatted} ${asset.symbol}) moves your Blend Health Factor from ${healthFactor.beforeFormatted}x to ${healthFactor.afterFormatted}x (liquidation drop buffer ${healthFactor.liquidationDropBeforePct}% → ${healthFactor.liquidationDropAfterPct}%).`;

  const createdAtMs = (deps.nowUnixSec ?? Math.floor(Date.now() / 1000)) * 1000;
  const proposal: TransactionProposal = {
    schemaVersion: TRANSACTION_PROPOSAL_SCHEMA_VERSION,
    proposalId: `prop_${crypto.randomBytes(12).toString('hex')}`,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + 5 * 60 * 1000).toISOString(),
    network: input.network,
    networkPassphrase: registry.networkPassphrase,
    ownerAddress: input.walletAddress,
    actionType: input.actionType,
    title,
    summary,
    ctaLabel,
    targetProtocol: input.targetProtocol,
    targetContractId,
    unsignedXdr,
    tokenDiffs,
    healthFactor,
    netApyDeltaBps,
    simulation,
    guardrail,
    warnings,
  };

  if (!isTransactionProposal(proposal)) {
    throw new Error('Constructed TransactionProposal failed runtime boundary validation');
  }

  return proposal;
}
