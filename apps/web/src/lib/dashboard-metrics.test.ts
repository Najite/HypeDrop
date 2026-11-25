import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PortfolioHealthSnapshot,
  YieldGuardPolicy,
} from '../../../../packages/agent-core/src/types';
import {
  buildPortfolioSafetyPoints,
  computeDashboardSummary,
} from './dashboard-metrics';

const SAMPLE_SNAPSHOT: PortfolioHealthSnapshot = {
  walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  network: 'TESTNET',
  totalCollateralUsd: '4000.00',
  totalDebtUsd: '2010.00',
  healthFactorBps: 13_432,
  healthFactorFormatted: '1.34',
  riskBand: 'caution',
  liquidationPriceDropPct: '25.55',
  positions: [],
  fetchedAt: '2026-11-25T00:00:00.000Z',
};

const SAMPLE_POLICY: YieldGuardPolicy = {
  owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  agentSigner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  maxSingleTxAmount: '10000000000',
  dailySpendLimit: '25000000000',
  spentInWindow: '5000000000',
  windowStart: 1700000000,
  minHealthFactorBps: 15_000,
  allowedProtocols: ['CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65'],
  isPaused: false,
};

test('computeDashboardSummary calculates net equity, utilization, and caution insight deterministically', () => {
  const summary = computeDashboardSummary(SAMPLE_SNAPSHOT, SAMPLE_POLICY, '330.00');
  assert.equal(summary.netEquityUsd, '1990.00');
  assert.equal(summary.spentTodayUsdc, 500);
  assert.equal(summary.dailyLimitUsdc, 2500);
  assert.equal(summary.singleTxCapUsdc, 1000);
  assert.equal(summary.dailyUtilizationPct, 20);
  assert.equal(summary.minHealthFactorFormatted, '1.50');
  assert.equal(summary.insight.severity, 'caution');
  assert.equal(summary.insight.actionKind, 'repay');
});

test('computeDashboardSummary prioritizes frozen state when policy is paused', () => {
  const frozen = computeDashboardSummary(
    SAMPLE_SNAPSHOT,
    { ...SAMPLE_POLICY, isPaused: true },
    '330.00',
  );
  assert.equal(frozen.insight.severity, 'frozen');
  assert.equal(frozen.insight.actionKind, 'unfreeze');
});

test('computeDashboardSummary switches to yield recommendation when loan is safe', () => {
  const safe = computeDashboardSummary(
    {
      ...SAMPLE_SNAPSHOT,
      healthFactorBps: 17_900,
      healthFactorFormatted: '1.79',
      riskBand: 'safe',
    },
    SAMPLE_POLICY,
    '0.00',
  );
  assert.equal(safe.insight.severity, 'safe');
  assert.equal(safe.insight.actionKind, 'yield');
});

test('buildPortfolioSafetyPoints shows higher projected HF after 500 USDC repayment across all shocks', () => {
  const points = buildPortfolioSafetyPoints(SAMPLE_SNAPSHOT, 500);
  assert.equal(points.length, 6);
  const spotPoint = points.find((p) => p.shockPct === 0);
  assert.ok(spotPoint);
  assert.equal(spotPoint.currentHf, 1.34);
  assert.ok(spotPoint.projectedHf > 1.75);
  assert.equal(spotPoint.currentBand, 'caution');
  assert.equal(spotPoint.projectedBand, 'safe');

  const drop20 = points.find((p) => p.shockPct === -20);
  assert.ok(drop20);
  assert.ok(drop20.projectedHf > drop20.currentHf);
});
