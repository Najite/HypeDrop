import Decimal from 'decimal.js';
import { z } from 'zod';
import {
  computeNetApyAfterSorobanFees,
  decimalToAtomic,
  formatDecimal,
} from '../math/risk';
import {
  isValidStellarPublicKey,
  type BasisPoints,
  type DeFindexVaultQuote,
  type DeFindexYieldComparison,
  type SorobanContractId,
  type YieldGuardPolicy,
} from '../types';
import {
  DEFAULT_TESTNET_CONTRACTS,
  getStellarProtocolRegistry,
  resolveYieldGuardPolicy,
  type SorobanRpcAdapter,
} from './stellar-context';

export const compareDefindexYieldsInputSchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Must be a valid Stellar Ed25519 G... public key'),
  assetCode: z.enum(['USDC', 'XLM', 'EURC']).default('USDC'),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'Amount must be a positive decimal string (up to 7 decimals)')
    .refine((val) => new Decimal(val).gt(0), 'Amount must be greater than zero'),
  horizonDays: z.number().int().min(1).max(365).default(90),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
});

export type CompareDefindexYieldsInput = z.input<typeof compareDefindexYieldsInputSchema>;

export interface CompareDefindexYieldsDeps {
  readonly policySnapshot?: YieldGuardPolicy;
  readonly rpcAdapter?: SorobanRpcAdapter;
}

interface RawVaultCandidate {
  readonly vaultId: SorobanContractId;
  readonly vaultName: string;
  readonly assetCode: 'USDC' | 'XLM' | 'EURC';
  readonly grossApyBps: BasisPoints;
  readonly protocolFeeBps: BasisPoints;
  readonly estimatedSorobanFeeStroops: string;
  readonly tvlUsd: string;
  readonly strategies: readonly string[];
}

const TESTNET_DEFINDEX_VAULTS: readonly RawVaultCandidate[] = [
  {
    vaultId: DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT,
    vaultName: 'DeFindex USDC Auto-Compound Blend Vault',
    assetCode: 'USDC',
    grossApyBps: 845, // 8.45% gross APY
    protocolFeeBps: 500, // 5% performance fee on yield
    estimatedSorobanFeeStroops: '185000', // 0.0185 XLM
    tvlUsd: '4820000.00',
    strategies: ['Blend Fixed Pool Supply', 'Automated BLND Harvest & Compound'],
  },
  {
    vaultId: DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BALANCED_VAULT,
    vaultName: 'DeFindex USDC Blend + Soroswap Balanced Vault',
    assetCode: 'USDC',
    grossApyBps: 1_040, // 10.40% gross APY
    protocolFeeBps: 800, // 8% performance fee on yield
    estimatedSorobanFeeStroops: '265000', // 0.0265 XLM
    tvlUsd: '2190000.00',
    strategies: ['Blend USDC Lending (65%)', 'Soroswap USDC/EURC Stable LP (35%)'],
  },
  {
    vaultId: DEFAULT_TESTNET_CONTRACTS.DEFINDEX_XLM_YIELD_VAULT,
    vaultName: 'DeFindex XLM Yield Optimizer Vault',
    assetCode: 'XLM',
    grossApyBps: 635, // 6.35% gross APY
    protocolFeeBps: 500,
    estimatedSorobanFeeStroops: '165000',
    tvlUsd: '3150000.00',
    strategies: ['Blend XLM Supply Pool', 'Auto-Compounding Rewards'],
  },
];

const BASELINE_BLEND_SUPPLY_APY_BPS: Record<'USDC' | 'XLM' | 'EURC', BasisPoints> = {
  USDC: 540, // 5.40%
  XLM: 420, // 4.20%
  EURC: 480, // 4.80%
};

export async function compareDefindexYields(
  rawInput: CompareDefindexYieldsInput,
  deps: CompareDefindexYieldsDeps = {},
): Promise<DeFindexYieldComparison> {
  const input = compareDefindexYieldsInputSchema.parse(rawInput);
  const registry = getStellarProtocolRegistry(input.network);
  const asset = registry.assets[input.assetCode];
  const policy = await resolveYieldGuardPolicy({
    owner: input.walletAddress,
    registry,
    policySnapshot: deps.policySnapshot,
    rpcAdapter: deps.rpcAdapter,
  });

  const amountDec = new Decimal(input.amount);
  const principalUsd = formatDecimal(amountDec.mul(new Decimal(asset.usdPrice)), 2);
  const currentBlendSupplyApyBps = BASELINE_BLEND_SUPPLY_APY_BPS[input.assetCode];

  const matchingVaults = TESTNET_DEFINDEX_VAULTS.filter(
    (v) => v.assetCode === input.assetCode,
  );
  const candidates = matchingVaults.length > 0 ? matchingVaults : TESTNET_DEFINDEX_VAULTS;

  const quotes: DeFindexVaultQuote[] = candidates
    .map((candidate) => {
      const candidateAsset = registry.assets[candidate.assetCode];
      const computed = computeNetApyAfterSorobanFees({
        principalUsd,
        currentApyBps: currentBlendSupplyApyBps,
        targetGrossApyBps: candidate.grossApyBps,
        protocolFeeBps: candidate.protocolFeeBps,
        sorobanFeeStroops: candidate.estimatedSorobanFeeStroops,
        xlmUsdPrice: registry.assets.XLM.usdPrice,
        horizonDays: input.horizonDays,
      });

      return {
        vaultId: candidate.vaultId,
        vaultName: candidate.vaultName,
        asset: candidateAsset,
        grossApyBps: candidate.grossApyBps,
        protocolFeeBps: candidate.protocolFeeBps,
        estimatedSorobanFeeXlm: computed.sorobanFeeXlm,
        estimatedSorobanFeeUsd: computed.sorobanFeeUsd,
        netApyBps: computed.netApyBps,
        netApyDeltaBps: computed.netApyDeltaBps,
        tvlUsd: candidate.tvlUsd,
        strategies: candidate.strategies,
        allowlistedInGuard: policy.allowedProtocols.includes(candidate.vaultId),
      };
    })
    .sort((a, b) => b.netApyBps - a.netApyBps);

  const bestAllowlisted = quotes.find((q) => q.allowlistedInGuard && q.netApyDeltaBps > 0);

  return {
    owner: input.walletAddress,
    evaluatedAmountAtomic: decimalToAtomic(amountDec, asset.decimals),
    evaluatedAmountFormatted: formatDecimal(amountDec, 2),
    horizonDays: input.horizonDays,
    currentBlendSupplyApyBps,
    bestVaultId: bestAllowlisted ? bestAllowlisted.vaultId : null,
    quotes,
    fetchedAt: new Date().toISOString(),
  };
}
