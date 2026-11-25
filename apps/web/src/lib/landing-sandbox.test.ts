import test from 'node:test';
import assert from 'node:assert/strict';
import { YieldGuardErrorCode } from '../../../../packages/agent-core/src/types';
import { evaluateLandingSandbox, validateAccessEmail } from './landing-sandbox';
import { buildBlendLiquidationCurve } from './liquidation-curve';

test('evaluateLandingSandbox lifts Blend HF from 1.34x Caution to 1.79x Safe and passes all 5 rules', () => {
  const result = evaluateLandingSandbox({
    repayUsdc: 500,
    xlmDrawdownPct: 0,
    maxSingleTxUsdc: 1000,
    minHealthFactorBps: 15_000,
    isPaused: false,
  });

  assert.equal(result.healthBeforeDisplay, '1.34');
  assert.equal(result.riskBandBefore, 'caution');
  assert.equal(result.healthAfterDisplay, '1.79');
  assert.equal(result.riskBandAfter, 'safe');
  assert.equal(result.allowed, true);
  assert.equal(result.passedRuleCount, 5);
  assert.equal(result.totalRuleCount, 5);
});

test('evaluateLandingSandbox blocks oversized repay with SingleTxLimitExceeded', () => {
  const result = evaluateLandingSandbox({
    repayUsdc: 1200,
    xlmDrawdownPct: 0,
    maxSingleTxUsdc: 1000,
    minHealthFactorBps: 15_000,
    isPaused: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.primaryErrorCode, YieldGuardErrorCode.SingleTxLimitExceeded);
});

test('evaluateLandingSandbox blocks steep XLM drawdown below Health Factor floor', () => {
  const result = evaluateLandingSandbox({
    repayUsdc: 100,
    xlmDrawdownPct: 35,
    maxSingleTxUsdc: 1000,
    minHealthFactorBps: 15_000,
    isPaused: false,
  });

  assert.equal(result.riskBandBefore, 'danger');
  assert.equal(result.allowed, false);
  assert.equal(result.primaryErrorCode, YieldGuardErrorCode.HealthFactorBelowMinimum);
});

test('evaluateLandingSandbox blocks all execution when Emergency Freeze is active', () => {
  const result = evaluateLandingSandbox({
    repayUsdc: 500,
    xlmDrawdownPct: 0,
    maxSingleTxUsdc: 1000,
    minHealthFactorBps: 15_000,
    isPaused: true,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.evaluation.status, 'paused');
  assert.equal(result.primaryErrorCode, YieldGuardErrorCode.GuardPaused);
});

test('validateAccessEmail enforces non-empty well-formed email addresses', () => {
  assert.equal(validateAccessEmail('').valid, false);
  assert.equal(validateAccessEmail('invalid-email').valid, false);
  assert.equal(validateAccessEmail('user@domain').valid, false);

  const ok = validateAccessEmail('  Treasury@Stellar-Desk.ORG ');
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, 'treasury@stellar-desk.org');
});

test('buildBlendLiquidationCurve lowers XLM liquidation price after 500 USDC repay', () => {
  const curve = buildBlendLiquidationCurve({
    spotXlmPriceUsd: 0.125,
    repayUsdc: 500,
  });

  assert.equal(curve.points.length, 21);
  assert.equal(curve.baselineBand, 'caution');
  assert.equal(curve.guardedBand, 'safe');
  assert.ok(curve.guardedLiquidationPriceUsd < curve.baselineLiquidationPriceUsd);
  assert.ok(curve.guardedDropBufferPct > curve.baselineDropBufferPct);
});
