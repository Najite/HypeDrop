import { z } from 'zod';
import {
  computeBlendHealthFactor,
  computeRequiredRepayUsdForTargetHf,
} from '../math/risk';
import {
  HEALTH_FACTOR_THRESHOLDS_BPS,
  isValidStellarPublicKey,
  type BlendPosition,
  type DecimalString,
  type PortfolioHealthSnapshot,
  type YieldGuardPolicy,
} from '../types';
import {
  getStellarProtocolRegistry,
  loadBlendTestnetPositions,
  resolveYieldGuardPolicy,
  type SorobanRpcAdapter,
} from './stellar-context';

export const getPortfolioHealthInputSchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Must be a valid Stellar Ed25519 G... public key'),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
});

export type GetPortfolioHealthInput = z.input<typeof getPortfolioHealthInputSchema>;

export interface GetPortfolioHealthResult {
  readonly snapshot: PortfolioHealthSnapshot;
  readonly policy: YieldGuardPolicy;
  readonly recommendedRepayToSafeUsdc: DecimalString;
}

export interface PortfolioHealthToolDeps {
  readonly policySnapshot?: YieldGuardPolicy;
  readonly positionsOverride?: readonly BlendPosition[];
  readonly rpcAdapter?: SorobanRpcAdapter;
  readonly fetchImpl?: typeof fetch;
}

export async function getPortfolioHealth(
  rawInput: GetPortfolioHealthInput,
  deps: PortfolioHealthToolDeps = {},
): Promise<GetPortfolioHealthResult> {
  const input = getPortfolioHealthInputSchema.parse(rawInput);
  const registry = getStellarProtocolRegistry(input.network);

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
      rpcAdapter: deps.rpcAdapter,
    }),
  ]);

  const metrics = computeBlendHealthFactor(positions);
  const targetSafeBps = Math.max(
    policy.minHealthFactorBps,
    HEALTH_FACTOR_THRESHOLDS_BPS.SAFE_EXCLUSIVE_MIN + 1_000, // target 1.60x buffer
  );
  const recommendedRepayToSafeUsdc = computeRequiredRepayUsdForTargetHf(
    positions,
    'USDC',
    targetSafeBps,
  );

  const snapshot: PortfolioHealthSnapshot = {
    owner: input.walletAddress,
    network: input.network,
    fetchedAt: new Date().toISOString(),
    totalCollateralUsd: metrics.totalCollateralUsd,
    totalRiskAdjustedCollateralUsd: metrics.totalRiskAdjustedCollateralUsd,
    totalDebtUsd: metrics.totalDebtUsd,
    totalRiskAdjustedDebtUsd: metrics.totalRiskAdjustedDebtUsd,
    healthFactorBps: metrics.healthFactorBps,
    healthFactorFormatted: metrics.healthFactorFormatted,
    riskBand: metrics.riskBand,
    liquidationPriceDropPct: metrics.liquidationPriceDropPct,
    netApyBps: metrics.netApyBps,
    positions,
  };

  return {
    snapshot,
    policy,
    recommendedRepayToSafeUsdc,
  };
}
