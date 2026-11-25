import Decimal from 'decimal.js';
import {
  classifyHealthRisk,
  type HealthRiskBand,
} from '../../../../packages/agent-core/src/types';

export interface LiquidationCurvePoint {
  readonly xlmPriceUsd: number;
  readonly baselineHf: number;
  readonly guardedHf: number;
}

export interface LiquidationCurveSnapshot {
  readonly spotXlmPriceUsd: number;
  readonly repayUsdc: number;
  readonly xlmCollateralUnits: number;
  readonly baselineDebtUsdc: number;
  readonly guardedDebtUsdc: number;
  readonly baselineHfAtSpot: number;
  readonly guardedHfAtSpot: number;
  readonly baselineBand: HealthRiskBand;
  readonly guardedBand: HealthRiskBand;
  readonly baselineLiquidationPriceUsd: number;
  readonly guardedLiquidationPriceUsd: number;
  readonly baselineDropBufferPct: number;
  readonly guardedDropBufferPct: number;
  readonly points: readonly LiquidationCurvePoint[];
}

const XLM_UNITS = new Decimal(32_000);
const BASE_DEBT = new Decimal(2_010);
const COLLATERAL_FACTOR = new Decimal('0.75');
const LIABILITY_FACTOR = new Decimal('0.90');

function computeHfForPriceAndDebt(xlmPriceUsd: number, debtUsdc: Decimal): number {
  if (debtUsdc.lte(0)) return 9.99;
  const riskAdjCollateral = XLM_UNITS.mul(xlmPriceUsd).mul(COLLATERAL_FACTOR);
  const riskAdjDebt = debtUsdc.div(LIABILITY_FACTOR);
  return Number(riskAdjCollateral.div(riskAdjDebt).toDecimalPlaces(3, Decimal.ROUND_DOWN).toString());
}

function computeLiquidationPrice(debtUsdc: Decimal): number {
  if (debtUsdc.lte(0)) return 0;
  // HF = 1.0 => XLM_UNITS * P * CF = debt / LF => P = debt / (LF * XLM_UNITS * CF)
  const price = debtUsdc.div(LIABILITY_FACTOR.mul(XLM_UNITS).mul(COLLATERAL_FACTOR));
  return Number(price.toDecimalPlaces(4, Decimal.ROUND_UP).toString());
}

export function buildBlendLiquidationCurve(params: {
  readonly spotXlmPriceUsd: number;
  readonly repayUsdc: number;
}): LiquidationCurveSnapshot {
  const spot = Math.max(0.06, Math.min(0.16, params.spotXlmPriceUsd));
  const repay = Math.max(0, Math.min(1800, params.repayUsdc));
  const guardedDebt = Decimal.max(new Decimal(0), BASE_DEBT.minus(repay));

  const minPrice = 0.06;
  const maxPrice = 0.16;
  const steps = 20;
  const points: LiquidationCurvePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const p = Number((minPrice + ((maxPrice - minPrice) * i) / steps).toFixed(4));
    points.push({
      xlmPriceUsd: p,
      baselineHf: computeHfForPriceAndDebt(p, BASE_DEBT),
      guardedHf: computeHfForPriceAndDebt(p, guardedDebt),
    });
  }

  const baselineHfAtSpot = computeHfForPriceAndDebt(spot, BASE_DEBT);
  const guardedHfAtSpot = computeHfForPriceAndDebt(spot, guardedDebt);
  const baselineLiq = computeLiquidationPrice(BASE_DEBT);
  const guardedLiq = computeLiquidationPrice(guardedDebt);

  const baselineDrop =
    baselineHfAtSpot <= 1 ? 0 : Number((((spot - baselineLiq) / spot) * 100).toFixed(2));
  const guardedDrop =
    guardedHfAtSpot <= 1 ? 0 : Number((((spot - guardedLiq) / spot) * 100).toFixed(2));

  return {
    spotXlmPriceUsd: Number(spot.toFixed(4)),
    repayUsdc: repay,
    xlmCollateralUnits: 32_000,
    baselineDebtUsdc: Number(BASE_DEBT.toFixed(2)),
    guardedDebtUsdc: Number(guardedDebt.toFixed(2)),
    baselineHfAtSpot,
    guardedHfAtSpot,
    baselineBand: classifyHealthRisk(Math.floor(baselineHfAtSpot * 10_000)),
    guardedBand: classifyHealthRisk(Math.floor(guardedHfAtSpot * 10_000)),
    baselineLiquidationPriceUsd: baselineLiq,
    guardedLiquidationPriceUsd: guardedLiq,
    baselineDropBufferPct: Math.max(0, baselineDrop),
    guardedDropBufferPct: Math.max(0, guardedDrop),
    points,
  };
}
