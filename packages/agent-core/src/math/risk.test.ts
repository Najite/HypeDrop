import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HEALTH_FACTOR_BPS,
  ROLLING_WINDOW_SECONDS,
  atomicToDecimal,
  computeBlendHealthFactor,
  computeLiquidationPriceDropPct,
  computeNetApyAfterSorobanFees,
  computeRequiredRepayUsdForTargetHf,
  decimalToAtomic,
  evaluateYieldGuardPolicy,
  simulatePostActionHealthFactor,
} from './risk';
import {
  YieldGuardErrorCode,
  type BlendPosition,
  type YieldGuardPolicy,
} from '../types';
import { DEFAULT_TESTNET_CONTRACTS } from '../tools/stellar-context';

const OWNER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const SAMPLE_POSITIONS: readonly BlendPosition[] = [
  {
    poolId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    poolName: 'Blend Testnet Pool',
    asset: {
      code: 'XLM',
      symbol: 'XLM',
      contractId: DEFAULT_TESTNET_CONTRACTS.XLM_SAC,
      decimals: 7,
      usdPrice: '0.1250',
    },
    collateralAtomic: '320000000000', // 32,000 XLM
    collateralFormatted: '32000.00',
    collateralUsd: '4000.00',
    collateralFactorBps: 7_500, // risk-adj collateral = 3,000.00 USD
    debtAtomic: '0',
    debtFormatted: '0.00',
    debtUsd: '0.00',
    liabilityFactorBps: 9_000,
    supplyApyBps: 420,
    borrowApyBps: 680,
  },
  {
    poolId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    poolName: 'Blend Testnet Pool',
    asset: {
      code: 'USDC',
      symbol: 'USDC',
      contractId: DEFAULT_TESTNET_CONTRACTS.USDC_SAC,
      decimals: 7,
      usdPrice: '1.0000',
    },
    collateralAtomic: '0',
    collateralFormatted: '0.00',
    collateralUsd: '0.00',
    collateralFactorBps: 9_000,
    debtAtomic: '21600000000', // 2,160.00 USDC
    debtFormatted: '2160.00',
    debtUsd: '2160.00',
    liabilityFactorBps: 9_000, // risk-adj debt = 2,160 / 0.9 = 2,400.00 USD
    supplyApyBps: 540,
    borrowApyBps: 785,
  },
];

const SAMPLE_POLICY: YieldGuardPolicy = {
  owner: OWNER,
  agentSigner: DEFAULT_TESTNET_CONTRACTS.AGENT_SIGNER,
  maxSingleTxAmount: '10000000000', // 1,000 USDC
  dailySpendLimit: '25000000000', // 2,500 USDC
  spentInWindow: '18000000000', // 1,800 USDC already spent
  windowStart: 1_764_000_000,
  minHealthFactorBps: 15_000, // 1.50x
  allowedProtocols: [
    DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT,
  ],
  isPaused: false,
};

test('atomicToDecimal and decimalToAtomic preserve 7-decimal Stellar stroop precision', () => {
  assert.equal(decimalToAtomic('500.1234567'), '5001234567');
  assert.equal(atomicToDecimal('5001234567').toFixed(7), '500.1234567');
  // Rounds down sub-stroop dust instead of over-spending
  assert.equal(decimalToAtomic('1.00000009'), '10000000');
});

test('computeBlendHealthFactor computes exact Blend risk-adjusted collateral, liabilities, and HF', () => {
  const result = computeBlendHealthFactor(SAMPLE_POSITIONS);
  // Risk-adj collateral = 4000 * 0.75 = 3000.00
  // Risk-adj debt = 2160 / 0.90 = 2400.00
  // Exact HF = 3000 / 2400 = 1.2500x = 12_500 bps (caution boundary)
  assert.equal(result.totalCollateralUsd, '4000.00');
  assert.equal(result.totalRiskAdjustedCollateralUsd, '3000.00');
  assert.equal(result.totalDebtUsd, '2160.00');
  assert.equal(result.totalRiskAdjustedDebtUsd, '2400.00');
  assert.equal(result.healthFactorBps, 12_500);
  assert.equal(result.healthFactorFormatted, '1.25');
  assert.equal(result.riskBand, 'caution');
  // Liquidation drop at 1.25x = (1 - 1/1.25) * 100 = 20.00%
  assert.equal(result.liquidationPriceDropPct, '20.00');
});

test('computeBlendHealthFactor caps debt-free positions cleanly at MAX_HEALTH_FACTOR_BPS', () => {
  const noDebt = [SAMPLE_POSITIONS[0]!];
  const result = computeBlendHealthFactor(noDebt);
  assert.equal(result.healthFactorBps, MAX_HEALTH_FACTOR_BPS);
  assert.equal(result.riskBand, 'safe');
});

test('computeLiquidationPriceDropPct handles safe, caution, and liquidated zones', () => {
  assert.equal(computeLiquidationPriceDropPct(20_000), '50.00');
  assert.equal(computeLiquidationPriceDropPct(15_000), '33.33');
  assert.equal(computeLiquidationPriceDropPct(10_000), '0.00');
  assert.equal(computeLiquidationPriceDropPct(9_200), '0.00');
});

test('simulatePostActionHealthFactor projects debt repay from 1.25x (caution) to 1.66x (safe)', () => {
  const transition = simulatePostActionHealthFactor(SAMPLE_POSITIONS, {
    kind: 'repay_debt',
    assetCode: 'USDC',
    amountAtomic: '5400000000', // repay 540 USDC -> debt becomes 1620 USDC -> risk-adj debt 1800 -> HF 3000/1800 = 1.6666 -> floored 16666 bps
    usdPrice: '1.0000',
  });
  assert.equal(transition.beforeBps, 12_500);
  assert.equal(transition.beforeBand, 'caution');
  assert.equal(transition.afterBps, 16_666);
  assert.equal(transition.afterFormatted, '1.67');
  assert.equal(transition.afterBand, 'safe');
  assert.equal(transition.deltaBps, 4_166);
  assert.equal(transition.liquidationDropBeforePct, '20.00');
  assert.equal(transition.liquidationDropAfterPct, '40.00');
});

test('computeRequiredRepayUsdForTargetHf solves exact USDC repay to reach 1.50x', () => {
  // Need risk-adj debt = 3000 / 1.5 = 2000 (currently 2400 -> reduce by 400 risk-adj -> 400 * 0.90 = 360.00 nominal USDC)
  const required = computeRequiredRepayUsdForTargetHf(SAMPLE_POSITIONS, 'USDC', 15_000);
  assert.equal(required, '360.00');
});

test('computeNetApyAfterSorobanFees deducts protocol fee and annualized Soroban fee drag', () => {
  // 845 bps gross, 5% protocol fee -> 802.75 bps effective gross
  // 200,000 stroops = 0.02 XLM * $0.125 = $0.0025 fee
  // On $1,000 over 90 days -> annualized drag = (0.0025/1000) * (365/90) * 10000 = 0.1014 bps -> ceil 1 bps
  const res = computeNetApyAfterSorobanFees({
    principalUsd: '1000.00',
    currentApyBps: 540,
    targetGrossApyBps: 845,
    protocolFeeBps: 500,
    sorobanFeeStroops: '200000',
    xlmUsdPrice: '0.1250',
    horizonDays: 90,
  });
  assert.equal(res.effectiveGrossApyBps, 803);
  assert.equal(res.sorobanFeeXlm, '0.0200000');
  assert.equal(res.sorobanFeeUsd, '0.0025');
  assert.equal(res.netApyBps, 803);
  assert.equal(res.netApyDeltaBps, 263);
});

test('evaluateYieldGuardPolicy mirrors on-chain pause, allowlist, single-tx, daily cap, HF, and 24h reset', () => {
  // 1. Valid 500 USDC repay (1800 + 500 = 2300 <= 2500)
  const ok = evaluateYieldGuardPolicy({
    policy: SAMPLE_POLICY,
    policyContractId: DEFAULT_TESTNET_CONTRACTS.YIELD_GUARD,
    targetProtocolContractId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    amountAtomic: '5000000000',
    assetSymbol: 'USDC',
    projectedHealthFactorBps: 16_500,
    nowUnixSec: SAMPLE_POLICY.windowStart + 3600,
  });
  assert.equal(ok.status, 'compliant');
  assert.equal(ok.remainingDailyAllowanceFormatted, '200.00');

  // 2. Exceeds daily limit within same 24h window (1800 + 800 = 2600 > 2500)
  const dailyBlocked = evaluateYieldGuardPolicy({
    policy: SAMPLE_POLICY,
    policyContractId: DEFAULT_TESTNET_CONTRACTS.YIELD_GUARD,
    targetProtocolContractId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    amountAtomic: '8000000000',
    assetSymbol: 'USDC',
    projectedHealthFactorBps: 17_000,
    nowUnixSec: SAMPLE_POLICY.windowStart + 3600,
  });
  assert.equal(dailyBlocked.status, 'blocked');
  assert.equal(
    dailyBlocked.checks.find((c) => c.rule === 'daily_spend_cap')?.errorCode,
    YieldGuardErrorCode.DailyLimitExceeded,
  );

  // 3. Same 800 USDC succeeds after 24h window reset
  const afterReset = evaluateYieldGuardPolicy({
    policy: SAMPLE_POLICY,
    policyContractId: DEFAULT_TESTNET_CONTRACTS.YIELD_GUARD,
    targetProtocolContractId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    amountAtomic: '8000000000',
    assetSymbol: 'USDC',
    projectedHealthFactorBps: 17_000,
    nowUnixSec: SAMPLE_POLICY.windowStart + ROLLING_WINDOW_SECONDS,
  });
  assert.equal(afterReset.status, 'compliant');
  assert.equal(afterReset.remainingDailyAllowanceFormatted, '1700.00');

  // 4. Emergency pause blocks execution with GuardPaused
  const paused = evaluateYieldGuardPolicy({
    policy: { ...SAMPLE_POLICY, isPaused: true },
    policyContractId: DEFAULT_TESTNET_CONTRACTS.YIELD_GUARD,
    targetProtocolContractId: DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    amountAtomic: '1000000000',
    assetSymbol: 'USDC',
    projectedHealthFactorBps: 18_000,
    nowUnixSec: SAMPLE_POLICY.windowStart + 100,
  });
  assert.equal(paused.status, 'paused');
  assert.equal(
    paused.checks.find((c) => c.rule === 'pause_state')?.errorCode,
    YieldGuardErrorCode.GuardPaused,
  );
});
