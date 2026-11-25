import Decimal from 'decimal.js';
import {
  classifyHealthRisk,
  type HealthRiskBand,
  type PortfolioHealthSnapshot,
  type YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';
import { atomicStroopsToUsdcNumber } from './utils';

export interface SafetyCurvePoint {
  readonly shockPct: number;
  readonly label: string;
  readonly currentHf: number;
  readonly projectedHf: number;
  readonly currentBand: HealthRiskBand;
  readonly projectedBand: HealthRiskBand;
}

export interface ProactiveInsight {
  readonly severity: 'safe' | 'caution' | 'danger' | 'frozen';
  readonly headline: string;
  readonly detail: string;
  readonly primaryActionLabel: string;
  readonly actionKind: 'repay' | 'yield' | 'unfreeze';
}

export interface DashboardSummary {
  readonly netEquityUsd: string;
  readonly totalCollateralUsd: string;
  readonly totalDebtUsd: string;
  readonly spentTodayUsdc: number;
  readonly dailyLimitUsdc: number;
  readonly singleTxCapUsdc: number;
  readonly dailyUtilizationPct: number;
  readonly minHealthFactorFormatted: string;
  readonly insight: ProactiveInsight;
}

const SHOCK_STEPS = [-30, -20, -10, 0, 10, 20] as const;

function clampHf(value: Decimal): number {
  const num = Number(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
  return Math.max(0.5, Math.min(3.5, num));
}

export function buildPortfolioSafetyPoints(
  snapshot: PortfolioHealthSnapshot | null,
  simulatedRepayUsdc: number = 500,
): readonly SafetyCurvePoint[] {
  if (!snapshot) {
    return SHOCK_STEPS.map((shockPct) => ({
      shockPct,
      label: shockPct === 0 ? 'Now' : `${shockPct > 0 ? '+' : ''}${shockPct}%`,
      currentHf: 1.34,
      projectedHf: 1.79,
      currentBand: 'caution',
      projectedBand: 'safe',
    }));
  }

  const baseHf = new Decimal(snapshot.healthFactorBps).div(10_000);
  const totalDebt = new Decimal(snapshot.totalDebtUsd);
  const repay = Decimal.max(new Decimal(0), new Decimal(simulatedRepayUsdc));
  const newDebt = Decimal.max(new Decimal(0), totalDebt.minus(repay));

  return SHOCK_STEPS.map((shockPct) => {
    const priceMultiplier = new Decimal(100 + shockPct).div(100);
    const currentHfRaw = totalDebt.lte(0) ? new Decimal(3.5) : baseHf.mul(priceMultiplier);

    let projectedHfRaw: Decimal;
    if (newDebt.lte(0)) {
      projectedHfRaw = new Decimal(3.5);
    } else if (totalDebt.lte(0)) {
      projectedHfRaw = new Decimal(3.5);
    } else {
      projectedHfRaw = currentHfRaw.mul(totalDebt).div(newDebt);
    }

    const currentHf = clampHf(currentHfRaw);
    const projectedHf = clampHf(projectedHfRaw);

    return {
      shockPct,
      label: shockPct === 0 ? 'Now' : `${shockPct > 0 ? '+' : ''}${shockPct}%`,
      currentHf,
      projectedHf,
      currentBand: classifyHealthRisk(Math.round(currentHf * 10_000)),
      projectedBand: classifyHealthRisk(Math.round(projectedHf * 10_000)),
    };
  });
}

export function computeDashboardSummary(
  snapshot: PortfolioHealthSnapshot | null,
  policy: YieldGuardPolicy,
  recommendedRepayUsdc: string,
): DashboardSummary {
  const collateral = snapshot ? new Decimal(snapshot.totalCollateralUsd) : new Decimal(0);
  const debt = snapshot ? new Decimal(snapshot.totalDebtUsd) : new Decimal(0);
  const netEquity = Decimal.max(new Decimal(0), collateral.minus(debt));

  const spentTodayUsdc = atomicStroopsToUsdcNumber(policy.spentInWindow);
  const dailyLimitUsdc = atomicStroopsToUsdcNumber(policy.dailySpendLimit);
  const singleTxCapUsdc = atomicStroopsToUsdcNumber(policy.maxSingleTxAmount);
  const dailyUtilizationPct =
    dailyLimitUsdc > 0
      ? Math.min(100, Math.round((spentTodayUsdc / dailyLimitUsdc) * 100))
      : 100;
  const minHealthFactorFormatted = (policy.minHealthFactorBps / 10_000).toFixed(2);

  let insight: ProactiveInsight;
  if (policy.isPaused) {
    insight = {
      severity: 'frozen',
      headline: 'Emergency Freeze is active on Soroban',
      detail:
        'All automated proposals and executions are locked on-chain until you lift the freeze from Guardrails.',
      primaryActionLabel: 'Review Freeze Status',
      actionKind: 'unfreeze',
    };
  } else if (!snapshot) {
    insight = {
      severity: 'safe',
      headline: 'Syncing Stellar Testnet positions',
      detail: 'Checking Blend collateral ratios and allowlisted DeFindex vaults.',
      primaryActionLabel: 'Compare DeFindex Yields',
      actionKind: 'yield',
    };
  } else if (snapshot.riskBand === 'danger') {
    const repayLabel = Number(recommendedRepayUsdc) > 0 ? recommendedRepayUsdc : '500.00';
    insight = {
      severity: 'danger',
      headline: `Liquidation danger at ${snapshot.healthFactorFormatted}x Health Factor`,
      detail: `Only a -${snapshot.liquidationPriceDropPct}% collateral drop remains. Repaying ${repayLabel} USDC restores a safe cushion.`,
      primaryActionLabel: 'Preview 500 USDC Repay',
      actionKind: 'repay',
    };
  } else if (snapshot.riskBand === 'caution') {
    const repayLabel = Number(recommendedRepayUsdc) > 0 ? recommendedRepayUsdc : '500.00';
    insight = {
      severity: 'caution',
      headline: `Health Factor is ${snapshot.healthFactorFormatted}x (below 1.50x target)`,
      detail: `Your Blend loan sits in the caution zone with a -${snapshot.liquidationPriceDropPct}% drop buffer. Repaying ${repayLabel} USDC moves you cleanly into Safe territory.`,
      primaryActionLabel: 'Preview 500 USDC Repay',
      actionKind: 'repay',
    };
  } else {
    insight = {
      severity: 'safe',
      headline: `Loan is healthy at ${snapshot.healthFactorFormatted}x`,
      detail: `You have a -${snapshot.liquidationPriceDropPct}% collateral buffer. Compare allowlisted DeFindex vaults to put idle USDC to work.`,
      primaryActionLabel: 'Compare DeFindex Yields',
      actionKind: 'yield',
    };
  }

  return {
    netEquityUsd: netEquity.toFixed(2),
    totalCollateralUsd: collateral.toFixed(2),
    totalDebtUsd: debt.toFixed(2),
    spentTodayUsdc,
    dailyLimitUsdc,
    singleTxCapUsdc,
    dailyUtilizationPct,
    minHealthFactorFormatted,
    insight,
  };
}
