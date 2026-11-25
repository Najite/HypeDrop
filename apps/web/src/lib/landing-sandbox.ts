import Decimal from 'decimal.js';
import {
  decimalToAtomic,
  evaluateYieldGuardPolicy,
  simulatePostActionHealthFactor,
} from '../../../../packages/agent-core/src/math/risk';
import {
  STELLAR_ASSET_DECIMALS,
  type BlendPosition,
  type GuardrailEvaluation,
  type HealthRiskBand,
  type YieldGuardErrorCode,
  type YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';

export interface LandingSandboxInput {
  readonly repayUsdc: number;
  readonly xlmDrawdownPct: number;
  readonly maxSingleTxUsdc: number;
  readonly minHealthFactorBps: number;
  readonly isPaused: boolean;
}

export interface LandingSandboxResult {
  readonly xlmPriceUsd: string;
  readonly collateralUsd: string;
  readonly debtBeforeUsd: string;
  readonly debtAfterUsd: string;
  readonly healthBeforeBps: number;
  readonly healthBeforeDisplay: string;
  readonly riskBandBefore: HealthRiskBand;
  readonly dropBufferBeforePct: string;
  readonly healthAfterBps: number;
  readonly healthAfterDisplay: string;
  readonly riskBandAfter: HealthRiskBand;
  readonly dropBufferAfterPct: string;
  readonly evaluation: GuardrailEvaluation;
  readonly allowed: boolean;
  readonly primaryErrorCode?: YieldGuardErrorCode;
  readonly passedRuleCount: number;
  readonly totalRuleCount: number;
}

const BASE_XLM_UNITS = 32_000;
const BASE_XLM_PRICE_USD = new Decimal('0.1250');
const BASE_USDC_DEBT = new Decimal('2010.00');
const YIELD_GUARD_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
const BLEND_POOL_ID = 'CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65';
const PREVIEW_OWNER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export function evaluateLandingSandbox(input: LandingSandboxInput): LandingSandboxResult {
  const clampedDrawdown = Math.max(0, Math.min(50, input.xlmDrawdownPct));
  const clampedRepay = Math.max(0, Math.min(2000, input.repayUsdc));
  const clampedMaxSingle = Math.max(100, Math.min(5000, input.maxSingleTxUsdc));
  const clampedMinHfBps = Math.max(11_000, Math.min(25_000, Math.round(input.minHealthFactorBps)));

  const priceMultiplier = new Decimal(100).minus(clampedDrawdown).div(100);
  const effectiveXlmPrice = BASE_XLM_PRICE_USD.mul(priceMultiplier);
  const collateralUsdDec = effectiveXlmPrice.mul(BASE_XLM_UNITS);
  const effectiveRepayDec = Decimal.min(new Decimal(clampedRepay), BASE_USDC_DEBT);
  const debtAfterDec = Decimal.max(new Decimal(0), BASE_USDC_DEBT.minus(effectiveRepayDec));

  const positions: readonly BlendPosition[] = [
    {
      poolId: BLEND_POOL_ID,
      poolName: 'Blend Testnet Yield Pool v2',
      asset: {
        code: 'XLM',
        symbol: 'XLM',
        contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        decimals: STELLAR_ASSET_DECIMALS,
        usdPrice: effectiveXlmPrice.toFixed(4),
      },
      collateralAtomic: (BigInt(BASE_XLM_UNITS) * 10_000_000n).toString(),
      collateralFormatted: BASE_XLM_UNITS.toFixed(2),
      collateralUsd: collateralUsdDec.toFixed(2),
      collateralFactorBps: 7_500,
      debtAtomic: '0',
      debtFormatted: '0.00',
      debtUsd: '0.00',
      liabilityFactorBps: 9_000,
      supplyApyBps: 420,
      borrowApyBps: 680,
    },
    {
      poolId: BLEND_POOL_ID,
      poolName: 'Blend Testnet Yield Pool v2',
      asset: {
        code: 'USDC',
        symbol: 'USDC',
        contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        decimals: STELLAR_ASSET_DECIMALS,
        usdPrice: '1.0000',
      },
      collateralAtomic: '0',
      collateralFormatted: '0.00',
      collateralUsd: '0.00',
      collateralFactorBps: 9_000,
      debtAtomic: decimalToAtomic(BASE_USDC_DEBT),
      debtFormatted: BASE_USDC_DEBT.toFixed(2),
      debtUsd: BASE_USDC_DEBT.toFixed(2),
      liabilityFactorBps: 9_000,
      supplyApyBps: 540,
      borrowApyBps: 785,
    },
  ];

  const repayAtomic = decimalToAtomic(effectiveRepayDec);
  const transition = simulatePostActionHealthFactor(positions, {
    kind: 'repay_debt',
    assetCode: 'USDC',
    amountAtomic: repayAtomic,
    usdPrice: '1.0000',
    decimals: STELLAR_ASSET_DECIMALS,
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const policy: YieldGuardPolicy = {
    owner: PREVIEW_OWNER,
    agentSigner: PREVIEW_OWNER,
    maxSingleTxAmount: decimalToAtomic(clampedMaxSingle.toFixed(2)),
    dailySpendLimit: decimalToAtomic('2500.00'),
    spentInWindow: '0',
    windowStart: nowSec,
    minHealthFactorBps: clampedMinHfBps,
    allowedProtocols: [BLEND_POOL_ID],
    isPaused: input.isPaused,
  };

  const evaluation = evaluateYieldGuardPolicy({
    policy,
    policyContractId: YIELD_GUARD_ID,
    targetProtocolContractId: BLEND_POOL_ID,
    amountAtomic: repayAtomic,
    assetSymbol: 'USDC',
    assetDecimals: STELLAR_ASSET_DECIMALS,
    projectedHealthFactorBps: transition.afterBps,
    nowUnixSec: nowSec,
  });

  const passedRuleCount = evaluation.checks.filter((check) => check.passed).length;
  const firstFailed = evaluation.checks.find((check) => !check.passed);

  return {
    xlmPriceUsd: effectiveXlmPrice.toFixed(4),
    collateralUsd: collateralUsdDec.toFixed(2),
    debtBeforeUsd: BASE_USDC_DEBT.toFixed(2),
    debtAfterUsd: debtAfterDec.toFixed(2),
    healthBeforeBps: transition.beforeBps,
    healthBeforeDisplay: transition.beforeFormatted,
    riskBandBefore: transition.beforeBand,
    dropBufferBeforePct: transition.liquidationDropBeforePct,
    healthAfterBps: transition.afterBps,
    healthAfterDisplay: transition.afterFormatted,
    riskBandAfter: transition.afterBand,
    dropBufferAfterPct: transition.liquidationDropAfterPct,
    evaluation,
    allowed: evaluation.status === 'compliant',
    primaryErrorCode: firstFailed?.errorCode,
    passedRuleCount,
    totalRuleCount: evaluation.checks.length,
  };
}

export interface EmailValidationResult {
  readonly valid: boolean;
  readonly normalized: string;
  readonly error?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAccessEmail(raw: string): EmailValidationResult {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      error: 'Enter an email address to receive Stellar Mainnet launch access.',
    };
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Enter a valid email address (for example, desk@protocol.org).',
    };
  }
  return {
    valid: true,
    normalized,
  };
}
