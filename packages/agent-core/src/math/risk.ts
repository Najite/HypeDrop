import Decimal from 'decimal.js';
import {
  BPS_SCALE,
  HEALTH_FACTOR_THRESHOLDS_BPS,
  STELLAR_ASSET_DECIMALS,
  YieldGuardErrorCode,
  classifyHealthRisk,
  type BasisPoints,
  type BlendPosition,
  type DecimalString,
  type GuardrailCheckItem,
  type GuardrailEvaluation,
  type HealthFactorTransition,
  type HealthRiskBand,
  type I128String,
  type SorobanContractId,
  type UnixTimestampSec,
  type YieldGuardPolicy,
} from '../types';

Decimal.set({
  precision: 36,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export const MAX_HEALTH_FACTOR_BPS: BasisPoints = 999_900; // 99.99x cap when debt is zero
export const ROLLING_WINDOW_SECONDS = 86_400; // 24 hours (mirrors Soroban WINDOW_DURATION_SECONDS)
export const DAYS_PER_YEAR = 365;

const TEN = new Decimal(10);
const BPS_DECIMAL = new Decimal(BPS_SCALE);
const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const HUNDRED = new Decimal(100);

// ---------------------------------------------------------------------------
// 1. Atomic <-> Decimal Deterministic Conversions
// ---------------------------------------------------------------------------

export function atomicToDecimal(
  atomic: I128String | bigint,
  decimals: number = STELLAR_ASSET_DECIMALS,
): Decimal {
  const scale = TEN.pow(decimals);
  return new Decimal(typeof atomic === 'bigint' ? atomic.toString() : atomic).div(scale);
}

export function decimalToAtomic(
  amount: string | Decimal,
  decimals: number = STELLAR_ASSET_DECIMALS,
): I128String {
  const value = amount instanceof Decimal ? amount : new Decimal(amount);
  if (!value.isFinite()) {
    throw new Error('Cannot convert non-finite decimal to atomic units');
  }
  const scale = TEN.pow(decimals);
  return value.mul(scale).toDecimalPlaces(0, Decimal.ROUND_DOWN).toFixed(0);
}

export function formatDecimal(value: Decimal, fixedDecimals: number = 2): DecimalString {
  return value.toDecimalPlaces(fixedDecimals, Decimal.ROUND_HALF_EVEN).toFixed(fixedDecimals);
}

export function formatHealthFactorFromBps(healthFactorBps: BasisPoints): DecimalString {
  return new Decimal(healthFactorBps).div(BPS_DECIMAL).toFixed(2);
}

// ---------------------------------------------------------------------------
// 2. Blend Protocol Health Factor & Liquidation Distance
// ---------------------------------------------------------------------------

export interface BlendHealthComputation {
  readonly totalCollateralUsd: DecimalString;
  readonly totalRiskAdjustedCollateralUsd: DecimalString;
  readonly totalDebtUsd: DecimalString;
  readonly totalRiskAdjustedDebtUsd: DecimalString;
  readonly healthFactorBps: BasisPoints;
  readonly healthFactorFormatted: DecimalString;
  readonly riskBand: HealthRiskBand;
  readonly liquidationPriceDropPct: DecimalString;
  readonly netApyBps: BasisPoints;
}

/**
 * Deterministic Blend Protocol Health Factor engine.
 *
 * Blend math:
 *   RiskAdjustedCollateral = Σ (collateralUsd_i * collateralFactorBps_i / 10_000)
 *   RiskAdjustedLiabilities = Σ (debtUsd_i / (liabilityFactorBps_i / 10_000))
 *   HealthFactor = RiskAdjustedCollateral / RiskAdjustedLiabilities
 *
 * Conservative floor rounding is applied when converting to integer basis points
 * so the reported Health Factor never overstates solvency.
 */
export function computeBlendHealthFactor(
  positions: readonly BlendPosition[],
): BlendHealthComputation {
  let totalCollateral = ZERO;
  let totalRiskAdjCollateral = ZERO;
  let totalDebt = ZERO;
  let totalRiskAdjDebt = ZERO;
  let weightedSupplyYieldUsd = ZERO;
  let weightedBorrowCostUsd = ZERO;

  for (const pos of positions) {
    const collateralUsd = new Decimal(pos.collateralUsd);
    const debtUsd = new Decimal(pos.debtUsd);
    const cf = new Decimal(pos.collateralFactorBps).div(BPS_DECIMAL);
    const lf = new Decimal(pos.liabilityFactorBps).div(BPS_DECIMAL);

    if (collateralUsd.lt(0) || debtUsd.lt(0)) {
      throw new Error(`Negative USD balance in Blend position for ${pos.asset.code}`);
    }
    if (lf.lte(0) || lf.gt(1)) {
      throw new Error(`Invalid Blend liability factor (${pos.liabilityFactorBps} bps) for ${pos.asset.code}`);
    }
    if (cf.lt(0) || cf.gt(1)) {
      throw new Error(`Invalid Blend collateral factor (${pos.collateralFactorBps} bps) for ${pos.asset.code}`);
    }

    totalCollateral = totalCollateral.plus(collateralUsd);
    totalRiskAdjCollateral = totalRiskAdjCollateral.plus(collateralUsd.mul(cf));
    totalDebt = totalDebt.plus(debtUsd);
    totalRiskAdjDebt = totalRiskAdjDebt.plus(debtUsd.div(lf));

    weightedSupplyYieldUsd = weightedSupplyYieldUsd.plus(
      collateralUsd.mul(pos.supplyApyBps).div(BPS_DECIMAL),
    );
    weightedBorrowCostUsd = weightedBorrowCostUsd.plus(
      debtUsd.mul(pos.borrowApyBps).div(BPS_DECIMAL),
    );
  }

  let healthFactorBps: BasisPoints;
  if (totalRiskAdjDebt.eq(0)) {
    healthFactorBps = MAX_HEALTH_FACTOR_BPS;
  } else {
    const rawHf = totalRiskAdjCollateral.div(totalRiskAdjDebt);
    const flooredBps = rawHf.mul(BPS_DECIMAL).floor().toNumber();
    healthFactorBps = Math.max(0, Math.min(MAX_HEALTH_FACTOR_BPS, flooredBps));
  }

  const netEquityUsd = totalCollateral.minus(totalDebt);
  let netApyBps: BasisPoints = 0;
  if (netEquityUsd.gt(0)) {
    const netYieldUsd = weightedSupplyYieldUsd.minus(weightedBorrowCostUsd);
    netApyBps = netYieldUsd
      .div(netEquityUsd)
      .mul(BPS_DECIMAL)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
  }

  return {
    totalCollateralUsd: formatDecimal(totalCollateral, 2),
    totalRiskAdjustedCollateralUsd: formatDecimal(totalRiskAdjCollateral, 2),
    totalDebtUsd: formatDecimal(totalDebt, 2),
    totalRiskAdjustedDebtUsd: formatDecimal(totalRiskAdjDebt, 2),
    healthFactorBps,
    healthFactorFormatted: formatHealthFactorFromBps(healthFactorBps),
    riskBand: classifyHealthRisk(healthFactorBps),
    liquidationPriceDropPct: computeLiquidationPriceDropPct(healthFactorBps),
    netApyBps,
  };
}

/**
 * Exact percentage drop in collateral value required to hit Blend liquidation (HF = 1.00x).
 *
 * Derived from: HF * (1 - d) = 1.0  =>  d = (1 - 1 / HF) * 100
 */
export function computeLiquidationPriceDropPct(healthFactorBps: BasisPoints): DecimalString {
  if (healthFactorBps <= HEALTH_FACTOR_THRESHOLDS_BPS.LIQUIDATION) {
    return '0.00';
  }
  const hf = new Decimal(healthFactorBps).div(BPS_DECIMAL);
  const dropFraction = ONE.minus(ONE.div(hf));
  return formatDecimal(dropFraction.mul(HUNDRED), 2);
}

// ---------------------------------------------------------------------------
// 3. Post-Action Health Factor Projection & Target Repay Solver
// ---------------------------------------------------------------------------

export interface PositionMutation {
  readonly kind: 'repay_debt' | 'add_collateral' | 'rebalance_vault' | 'swap_and_repay';
  readonly assetCode: string;
  readonly amountAtomic: I128String;
  readonly usdPrice: DecimalString;
  readonly decimals?: number;
}

export function simulatePostActionHealthFactor(
  positions: readonly BlendPosition[],
  mutation: PositionMutation,
): HealthFactorTransition {
  const before = computeBlendHealthFactor(positions);
  const decimals = mutation.decimals ?? STELLAR_ASSET_DECIMALS;
  const deltaUnits = atomicToDecimal(mutation.amountAtomic, decimals);
  const deltaUsd = deltaUnits.mul(new Decimal(mutation.usdPrice));

  const nextPositions: BlendPosition[] = positions.map((pos) => {
    if (pos.asset.code.toUpperCase() !== mutation.assetCode.toUpperCase()) {
      return pos;
    }

    if (mutation.kind === 'repay_debt' || mutation.kind === 'swap_and_repay') {
      const currentDebtAtomic = BigInt(pos.debtAtomic);
      const repayAtomic = BigInt(mutation.amountAtomic);
      const nextDebtAtomic = currentDebtAtomic > repayAtomic ? currentDebtAtomic - repayAtomic : 0n;
      const nextDebtUnits = atomicToDecimal(nextDebtAtomic, pos.asset.decimals);
      const nextDebtUsd = Decimal.max(ZERO, new Decimal(pos.debtUsd).minus(deltaUsd));
      return {
        ...pos,
        debtAtomic: nextDebtAtomic.toString(),
        debtFormatted: formatDecimal(nextDebtUnits, 2),
        debtUsd: formatDecimal(nextDebtUsd, 2),
      };
    }

    if (mutation.kind === 'add_collateral') {
      const nextCollAtomic = BigInt(pos.collateralAtomic) + BigInt(mutation.amountAtomic);
      const nextCollUnits = atomicToDecimal(nextCollAtomic, pos.asset.decimals);
      const nextCollUsd = new Decimal(pos.collateralUsd).plus(deltaUsd);
      return {
        ...pos,
        collateralAtomic: nextCollAtomic.toString(),
        collateralFormatted: formatDecimal(nextCollUnits, 2),
        collateralUsd: formatDecimal(nextCollUsd, 2),
      };
    }

    // rebalance_vault moves idle/excess yield capital outside the Blend debt position
    return pos;
  });

  const after = computeBlendHealthFactor(nextPositions);

  return {
    beforeBps: before.healthFactorBps,
    beforeFormatted: before.healthFactorFormatted,
    beforeBand: before.riskBand,
    afterBps: after.healthFactorBps,
    afterFormatted: after.healthFactorFormatted,
    afterBand: after.riskBand,
    deltaBps: after.healthFactorBps - before.healthFactorBps,
    liquidationDropBeforePct: before.liquidationPriceDropPct,
    liquidationDropAfterPct: after.liquidationPriceDropPct,
  };
}

/**
 * Deterministically computes the exact debt repayment (in USD) needed to raise
 * a Blend portfolio to `targetHealthFactorBps` (e.g. 16_000 = 1.60x).
 */
export function computeRequiredRepayUsdForTargetHf(
  positions: readonly BlendPosition[],
  debtAssetCode: string,
  targetHealthFactorBps: BasisPoints,
): DecimalString {
  const current = computeBlendHealthFactor(positions);
  if (current.healthFactorBps >= targetHealthFactorBps) {
    return '0.00';
  }

  const targetPos = positions.find(
    (p) => p.asset.code.toUpperCase() === debtAssetCode.toUpperCase() && BigInt(p.debtAtomic) > 0n,
  );
  if (!targetPos) {
    return '0.00';
  }

  const riskAdjCollateral = new Decimal(current.totalRiskAdjustedCollateralUsd);
  const currentRiskAdjDebt = new Decimal(current.totalRiskAdjustedDebtUsd);
  const targetHf = new Decimal(targetHealthFactorBps).div(BPS_DECIMAL);
  const targetRiskAdjDebt = riskAdjCollateral.div(targetHf);

  const riskAdjDebtReduction = Decimal.max(ZERO, currentRiskAdjDebt.minus(targetRiskAdjDebt));
  const lf = new Decimal(targetPos.liabilityFactorBps).div(BPS_DECIMAL);
  const nominalRepayUsd = Decimal.min(new Decimal(targetPos.debtUsd), riskAdjDebtReduction.mul(lf));

  return formatDecimal(nominalRepayUsd, 2);
}

// ---------------------------------------------------------------------------
// 4. Net APY Delta After Soroban Fees
// ---------------------------------------------------------------------------

export interface NetApyParams {
  readonly principalUsd: DecimalString;
  readonly currentApyBps: BasisPoints;
  readonly targetGrossApyBps: BasisPoints;
  readonly protocolFeeBps: BasisPoints;
  readonly sorobanFeeStroops: I128String;
  readonly xlmUsdPrice: DecimalString;
  readonly horizonDays: number;
}

export interface NetApyComputation {
  readonly effectiveGrossApyBps: BasisPoints;
  readonly sorobanFeeXlm: DecimalString;
  readonly sorobanFeeUsd: DecimalString;
  readonly annualizedFeeDragBps: BasisPoints;
  readonly netApyBps: BasisPoints;
  readonly netApyDeltaBps: number;
}

/**
 * Computes net APY and APY delta (in integer basis points) after deducting:
 *   1. DeFindex protocol performance fee (`protocolFeeBps`)
 *   2. Annualized Soroban transaction + footprint resource fee drag over `horizonDays`
 */
export function computeNetApyAfterSorobanFees(params: NetApyParams): NetApyComputation {
  const principal = new Decimal(params.principalUsd);
  if (principal.lte(0)) {
    throw new Error('principalUsd must be strictly positive');
  }
  if (params.horizonDays <= 0) {
    throw new Error('horizonDays must be strictly positive');
  }

  const feeMultiplier = ONE.minus(new Decimal(params.protocolFeeBps).div(BPS_DECIMAL));
  const effectiveGross = new Decimal(params.targetGrossApyBps).mul(feeMultiplier);

  const sorobanFeeXlmDec = atomicToDecimal(params.sorobanFeeStroops, STELLAR_ASSET_DECIMALS);
  const sorobanFeeUsdDec = sorobanFeeXlmDec.mul(new Decimal(params.xlmUsdPrice));

  // Annualized drag in bps = (feeUsd / principalUsd) * (365 / horizonDays) * 10_000
  const feeDragDec = sorobanFeeUsdDec
    .div(principal)
    .mul(new Decimal(DAYS_PER_YEAR).div(params.horizonDays))
    .mul(BPS_DECIMAL);

  const effectiveGrossApyBps = effectiveGross
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  const annualizedFeeDragBps = feeDragDec
    .toDecimalPlaces(0, Decimal.ROUND_UP)
    .toNumber();
  const netApyBps = effectiveGross
    .minus(feeDragDec)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();

  return {
    effectiveGrossApyBps,
    sorobanFeeXlm: formatDecimal(sorobanFeeXlmDec, 7),
    sorobanFeeUsd: formatDecimal(sorobanFeeUsdDec, 4),
    annualizedFeeDragBps,
    netApyBps,
    netApyDeltaBps: netApyBps - params.currentApyBps,
  };
}

// ---------------------------------------------------------------------------
// 5. Off-Chain Deterministic Mirror of Soroban YieldGuardPolicy Enforcement
// ---------------------------------------------------------------------------

export interface PolicyEvaluationParams {
  readonly policy: YieldGuardPolicy;
  readonly policyContractId: SorobanContractId;
  readonly targetProtocolContractId: SorobanContractId;
  readonly amountAtomic: I128String;
  readonly assetSymbol: string;
  readonly assetDecimals?: number;
  readonly projectedHealthFactorBps: BasisPoints;
  readonly nowUnixSec?: UnixTimestampSec;
}

/**
 * Mirrors `YieldGuardContract::validate_and_record_execution` using exact BigInt
 * arithmetic so the agent and UI know compliance status before user wallet signing.
 */
export function evaluateYieldGuardPolicy(params: PolicyEvaluationParams): GuardrailEvaluation {
  const { policy } = params;
  const decimals = params.assetDecimals ?? STELLAR_ASSET_DECIMALS;
  const nowSec = params.nowUnixSec ?? Math.floor(Date.now() / 1000);

  const amount = BigInt(params.amountAtomic);
  const maxSingle = BigInt(policy.maxSingleTxAmount);
  const dailyLimit = BigInt(policy.dailySpendLimit);
  const windowElapsed = nowSec - policy.windowStart;
  const effectiveSpent =
    windowElapsed >= ROLLING_WINDOW_SECONDS ? 0n : BigInt(policy.spentInWindow);
  const nextSpent = effectiveSpent + amount;

  const fmtAmt = (val: bigint) =>
    `${formatDecimal(atomicToDecimal(val, decimals), 2)} ${params.assetSymbol}`;

  const pausePassed = !policy.isPaused;
  const protocolPassed = policy.allowedProtocols.includes(params.targetProtocolContractId);
  const singleCapPassed = amount > 0n && amount <= maxSingle;
  const dailyCapPassed = amount > 0n && nextSpent <= dailyLimit;
  const hfPassed = params.projectedHealthFactorBps >= policy.minHealthFactorBps;

  const checks: GuardrailCheckItem[] = [
    {
      rule: 'pause_state',
      passed: pausePassed,
      label: 'Emergency Freeze Status',
      observed: policy.isPaused ? 'Paused' : 'Active',
      limit: 'Active',
      errorCode: pausePassed ? undefined : YieldGuardErrorCode.GuardPaused,
    },
    {
      rule: 'protocol_allowlist',
      passed: protocolPassed,
      label: 'Protocol Allowlist',
      observed: protocolPassed ? 'Allowlisted' : 'Unlisted Contract',
      limit: `${policy.allowedProtocols.length} allowlisted`,
      errorCode: protocolPassed ? undefined : YieldGuardErrorCode.UnauthorizedProtocol,
    },
    {
      rule: 'single_tx_cap',
      passed: singleCapPassed,
      label: 'Single-Tx Spend Cap',
      observed: fmtAmt(amount),
      limit: fmtAmt(maxSingle),
      errorCode: singleCapPassed
        ? undefined
        : amount <= 0n
          ? YieldGuardErrorCode.InvalidAmount
          : YieldGuardErrorCode.SingleTxLimitExceeded,
    },
    {
      rule: 'daily_spend_cap',
      passed: dailyCapPassed,
      label: '24h Rolling Spend Limit',
      observed: fmtAmt(nextSpent),
      limit: fmtAmt(dailyLimit),
      errorCode: dailyCapPassed ? undefined : YieldGuardErrorCode.DailyLimitExceeded,
    },
    {
      rule: 'min_health_factor',
      passed: hfPassed,
      label: 'Minimum Health Factor',
      observed: `${formatHealthFactorFromBps(params.projectedHealthFactorBps)}x`,
      limit: `${formatHealthFactorFromBps(policy.minHealthFactorBps)}x`,
      errorCode: hfPassed ? undefined : YieldGuardErrorCode.HealthFactorBelowMinimum,
    },
  ];

  const remainingAtomic = dailyLimit > nextSpent ? dailyLimit - nextSpent : 0n;
  const utilizationBps =
    dailyLimit > 0n
      ? Number((nextSpent * BigInt(BPS_SCALE)) / dailyLimit)
      : BPS_SCALE;

  let status: GuardrailEvaluation['status'] = 'compliant';
  if (!pausePassed) {
    status = 'paused';
  } else if (checks.some((c) => !c.passed)) {
    status = 'blocked';
  }

  return {
    status,
    policyContractId: params.policyContractId,
    checkedAt: new Date(nowSec * 1000).toISOString(),
    remainingDailyAllowanceAtomic: remainingAtomic.toString(),
    remainingDailyAllowanceFormatted: formatDecimal(atomicToDecimal(remainingAtomic, decimals), 2),
    dailyCapUtilizationAfterTxBps: Math.min(100_000, Math.max(0, utilizationBps)),
    checks,
  };
}
