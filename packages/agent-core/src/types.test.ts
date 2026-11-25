import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSACTION_PROPOSAL_SCHEMA_VERSION,
  STELLAR_NETWORK_PASSPHRASES,
  YieldGuardErrorCode,
  classifyHealthRisk,
  isI128String,
  isTransactionProposal,
  isValidSorobanContractId,
  isValidStellarPublicKey,
  type TransactionProposal,
} from './types';

const VALID_OWNER = 'G' + 'A'.repeat(55);
const VALID_CONTRACT_BLEND = 'C' + 'B'.repeat(55);
const VALID_CONTRACT_GUARD = 'C' + 'G'.repeat(55);
const VALID_CONTRACT_USDC = 'C' + 'U'.repeat(55);

function buildValidProposal(): TransactionProposal {
  return {
    schemaVersion: TRANSACTION_PROPOSAL_SCHEMA_VERSION,
    proposalId: 'prop_01j9k2m3n4p5q6r7s8t9u0v1w2',
    createdAt: '2026-11-25T09:00:00.000Z',
    expiresAt: '2026-11-25T09:05:00.000Z',
    network: 'TESTNET',
    networkPassphrase: STELLAR_NETWORK_PASSPHRASES.TESTNET,
    ownerAddress: VALID_OWNER,
    actionType: 'repay_debt',
    title: 'Repay Blend USDC Debt',
    summary: 'Repaying 500 USDC raises your Blend Health Factor from 1.22x (Danger) to 1.68x (Safe).',
    ctaLabel: 'Approve & Sign Repay · 500 USDC',
    targetProtocol: 'blend',
    targetContractId: VALID_CONTRACT_BLEND,
    unsignedXdr: 'AAAAAgAAAABtestUnsignedXdrPayloadBase64==',
    tokenDiffs: [
      {
        asset: {
          code: 'USDC',
          symbol: 'USDC',
          contractId: VALID_CONTRACT_USDC,
          decimals: 7,
          usdPrice: '1.0000',
        },
        direction: 'outflow',
        amountAtomic: '5000000000',
        amountFormatted: '500.00',
        usdValue: '500.00',
        counterpartyProtocol: 'blend',
        counterpartyContractId: VALID_CONTRACT_BLEND,
      },
    ],
    healthFactor: {
      beforeBps: 12_200,
      beforeFormatted: '1.22',
      beforeBand: 'danger',
      afterBps: 16_800,
      afterFormatted: '1.68',
      afterBand: 'safe',
      deltaBps: 4_600,
      liquidationDropBeforePct: '18.03',
      liquidationDropAfterPct: '40.48',
    },
    netApyDeltaBps: 115,
    simulation: {
      status: 'verified',
      simulatedAt: '2026-11-25T09:00:00.000Z',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      minResourceFeeStroops: '142500',
      recommendedFeeStroops: '165000',
      recommendedFeeXlm: '0.0165000',
      recommendedFeeUsd: '0.0020',
      cpuInstructions: 4_120_000,
      readBytes: 12_400,
      writeBytes: 2_100,
      latestLedger: 1_245_890,
    },
    guardrail: {
      status: 'compliant',
      policyContractId: VALID_CONTRACT_GUARD,
      checkedAt: '2026-11-25T09:00:00.000Z',
      remainingDailyAllowanceAtomic: '15000000000',
      remainingDailyAllowanceFormatted: '1500.00',
      dailyCapUtilizationAfterTxBps: 2_500,
      checks: [
        {
          rule: 'pause_state',
          passed: true,
          label: 'Guard Active',
          observed: 'Active',
          limit: 'Not Paused',
        },
        {
          rule: 'protocol_allowlist',
          passed: true,
          label: 'Protocol Allowlist',
          observed: VALID_CONTRACT_BLEND,
          limit: 'Allowlisted',
        },
        {
          rule: 'single_tx_cap',
          passed: true,
          label: 'Single-Tx Cap',
          observed: '500.00 USDC',
          limit: '1000.00 USDC',
        },
        {
          rule: 'daily_spend_cap',
          passed: true,
          label: '24h Rolling Spend Cap',
          observed: '500.00 USDC',
          limit: '2000.00 USDC',
        },
        {
          rule: 'min_health_factor',
          passed: true,
          label: 'Minimum Health Factor',
          observed: '1.68x',
          limit: '1.50x',
        },
      ],
    },
    warnings: [],
  };
}

test('classifyHealthRisk maps basis points to OKLCH semantic risk bands', () => {
  assert.equal(classifyHealthRisk(15_001), 'safe');
  assert.equal(classifyHealthRisk(20_000), 'safe');
  assert.equal(classifyHealthRisk(15_000), 'caution');
  assert.equal(classifyHealthRisk(13_500), 'caution');
  assert.equal(classifyHealthRisk(12_500), 'caution');
  assert.equal(classifyHealthRisk(12_499), 'danger');
  assert.equal(classifyHealthRisk(10_000), 'danger');
  assert.equal(classifyHealthRisk(0), 'danger');
});

test('Stellar StrKey validators enforce 56-char G and C prefixes', () => {
  assert.equal(isValidStellarPublicKey(VALID_OWNER), true);
  assert.equal(isValidStellarPublicKey(VALID_CONTRACT_BLEND), false);
  assert.equal(isValidStellarPublicKey('GSHORT'), false);

  assert.equal(isValidSorobanContractId(VALID_CONTRACT_BLEND), true);
  assert.equal(isValidSorobanContractId(VALID_OWNER), false);
  assert.equal(isValidSorobanContractId('C_INVALID_LOWERCASE'), false);
});

test('isI128String enforces signed 128-bit integer bounds and rejects floats', () => {
  assert.equal(isI128String('0'), true);
  assert.equal(isI128String('5000000000'), true);
  assert.equal(isI128String('-5000000000'), true);
  assert.equal(isI128String('170141183460469231731687303715884105727'), true);
  assert.equal(isI128String('-170141183460469231731687303715884105728'), true);

  assert.equal(isI128String('170141183460469231731687303715884105728'), false);
  assert.equal(isI128String('-170141183460469231731687303715884105729'), false);
  assert.equal(isI128String('500.00'), false);
  assert.equal(isI128String('00500'), false);
  assert.equal(isI128String(''), false);
});

test('isTransactionProposal accepts a well-formed compliant proposal', () => {
  const proposal = buildValidProposal();
  assert.equal(isTransactionProposal(proposal), true);
});

test('isTransactionProposal accepts blocked proposals with explicit YieldGuardErrorCode', () => {
  const proposal = buildValidProposal();
  const blocked: TransactionProposal = {
    ...proposal,
    guardrail: {
      ...proposal.guardrail,
      status: 'blocked',
      checks: [
        ...proposal.guardrail.checks.slice(0, 2),
        {
          rule: 'single_tx_cap',
          passed: false,
          label: 'Single-Tx Cap',
          observed: '1500.00 USDC',
          limit: '1000.00 USDC',
          errorCode: YieldGuardErrorCode.SingleTxLimitExceeded,
        },
      ],
    },
  };
  assert.equal(isTransactionProposal(blocked), true);
});

test('isTransactionProposal rejects malformed payloads', () => {
  const base = buildValidProposal();
  assert.equal(isTransactionProposal(null), false);
  assert.equal(isTransactionProposal({ ...base, schemaVersion: '2.0.0' }), false);
  assert.equal(isTransactionProposal({ ...base, ownerAddress: 'invalid' }), false);
  assert.equal(
    isTransactionProposal({
      ...base,
      tokenDiffs: [{ ...base.tokenDiffs[0], amountAtomic: '500.25' }],
    }),
    false,
  );
  assert.equal(isTransactionProposal({ ...base, unsignedXdr: '   ' }), false);
});
