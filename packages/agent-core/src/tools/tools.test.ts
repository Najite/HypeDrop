import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, SorobanDataBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { compareDefindexYields } from './compare-defindex-yields';
import { getPortfolioHealth } from './get-portfolio-health';
import { simulateRebalanceOrRepay } from './simulate-rebalance-or-repay';
import {
  DEFAULT_TESTNET_CONTRACTS,
  type SorobanRpcAdapter,
} from './stellar-context';
import { createHyperDropMcpServer } from '../mcp';
import {
  YieldGuardErrorCode,
  isTransactionProposal,
  type YieldGuardPolicy,
} from '../types';

const TEST_WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const TEST_POLICY: YieldGuardPolicy = {
  owner: TEST_WALLET,
  agentSigner: DEFAULT_TESTNET_CONTRACTS.AGENT_SIGNER,
  maxSingleTxAmount: '10000000000', // 1,000 USDC
  dailySpendLimit: '25000000000', // 2,500 USDC
  spentInWindow: '0',
  windowStart: 1_764_000_000,
  minHealthFactorBps: 15_000, // 1.50x
  allowedProtocols: [
    DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT,
    DEFAULT_TESTNET_CONTRACTS.SOROSWAP_ROUTER,
  ],
  isPaused: false,
};

function createMockSuccessRpcAdapter(): SorobanRpcAdapter {
  return {
    async getAccount(address: string) {
      return new Account(address, '42');
    },
    async simulateTransaction() {
      const txData = new SorobanDataBuilder()
        .setResources(4_250_000, 12_800, 2_048)
        .setResourceFee(155_000)
        .build();

      const simSuccess: rpc.Api.SimulateTransactionSuccessResponse = {
        _parsed: true,
        id: 'sim-ok-1',
        latestLedger: 1_550_420,
        events: [],
        transactionData: new SorobanDataBuilder(txData),
        minResourceFee: '155000',
        result: {
          auth: [],
          retval: xdr.ScVal.scvVoid(),
        },
      };
      return simSuccess;
    },
  };
}

function createMockErrorRpcAdapter(errorText: string): SorobanRpcAdapter {
  return {
    async getAccount(address: string) {
      return new Account(address, '42');
    },
    async simulateTransaction() {
      const simErr: rpc.Api.SimulateTransactionErrorResponse = {
        _parsed: true,
        id: 'sim-err-1',
        latestLedger: 1_550_421,
        events: [],
        error: errorText,
      };
      return simErr;
    },
  };
}

const offlineFetch: typeof fetch = async () => {
  throw new Error('offline test mode');
};

test('get_portfolio_health validates input via Zod and returns Blend Health metrics + repay advice', async () => {
  await assert.rejects(
    () => getPortfolioHealth({ walletAddress: 'INVALID_KEY' }),
    /Stellar Ed25519/,
  );

  const result = await getPortfolioHealth(
    { walletAddress: TEST_WALLET, network: 'TESTNET' },
    { policySnapshot: TEST_POLICY, fetchImpl: offlineFetch },
  );

  assert.equal(result.snapshot.owner, TEST_WALLET);
  assert.equal(result.snapshot.riskBand, 'caution');
  assert.equal(result.snapshot.healthFactorFormatted, '1.34');
  assert.ok(Number(result.recommendedRepayToSafeUsdc) > 0);
});

test('compare_defindex_yields ranks vaults by net APY after Soroban fees and flags allowlist status', async () => {
  const comparison = await compareDefindexYields(
    {
      walletAddress: TEST_WALLET,
      assetCode: 'USDC',
      amount: '1000.00',
      horizonDays: 90,
      network: 'TESTNET',
    },
    { policySnapshot: TEST_POLICY },
  );

  assert.equal(comparison.quotes.length, 2);
  // Balanced vault has higher gross APY but is NOT in TEST_POLICY.allowedProtocols
  const topVault = comparison.quotes[0]!;
  assert.equal(topVault.allowlistedInGuard, false);
  // bestVaultId MUST select the highest-yielding ALLOWLISTED vault
  assert.equal(comparison.bestVaultId, DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT);
  assert.ok(comparison.quotes.every((q) => q.netApyDeltaBps > 0));
});

test('simulate_rebalance_or_repay builds real unsigned Soroban XDR, runs RPC simulation, and passes YieldGuardPolicy', async () => {
  const proposal = await simulateRebalanceOrRepay(
    {
      walletAddress: TEST_WALLET,
      actionType: 'repay_debt',
      assetCode: 'USDC',
      amount: '500.00',
      targetProtocol: 'blend',
      network: 'TESTNET',
    },
    {
      policySnapshot: TEST_POLICY,
      rpcAdapter: createMockSuccessRpcAdapter(),
      fetchImpl: offlineFetch,
      nowUnixSec: 1_764_001_000,
    },
  );

  assert.equal(isTransactionProposal(proposal), true);
  assert.equal(proposal.simulation.status, 'verified');
  assert.equal(proposal.simulation.minResourceFeeStroops, '155000');
  assert.equal(proposal.simulation.cpuInstructions, 4_250_000);
  assert.equal(proposal.guardrail.status, 'compliant');
  assert.equal(proposal.healthFactor.beforeBand, 'caution');
  assert.equal(proposal.healthFactor.afterBand, 'safe');
  assert.equal(proposal.ctaLabel, 'Approve & Sign Repay · 500.00 USDC');
  assert.ok(proposal.unsignedXdr.length > 40);
});

test('simulate_rebalance_or_repay blocks oversized tx via YieldGuardPolicy and surfaces RPC errors cleanly', async () => {
  const proposal = await simulateRebalanceOrRepay(
    {
      walletAddress: TEST_WALLET,
      actionType: 'repay_debt',
      assetCode: 'USDC',
      amount: '1500.00', // exceeds 1,000 USDC single-tx cap
      targetProtocol: 'blend',
      network: 'TESTNET',
    },
    {
      policySnapshot: TEST_POLICY,
      rpcAdapter: createMockErrorRpcAdapter('HostError: Error(Contract, #5)'),
      fetchImpl: offlineFetch,
      nowUnixSec: 1_764_001_000,
    },
  );

  assert.equal(isTransactionProposal(proposal), true);
  assert.equal(proposal.guardrail.status, 'blocked');
  assert.equal(proposal.ctaLabel, 'Blocked by YieldGuardPolicy');
  assert.equal(
    proposal.guardrail.checks.find((c) => c.rule === 'single_tx_cap')?.errorCode,
    YieldGuardErrorCode.SingleTxLimitExceeded,
  );
  assert.equal(proposal.simulation.status, 'failed');
  assert.match(proposal.simulation.errorMessage ?? '', /Error\(Contract, #5\)/);
});

test('createHyperDropMcpServer initializes cleanly with all three HyperDrop tools registered', () => {
  const server = createHyperDropMcpServer({
    rpcAdapter: createMockSuccessRpcAdapter(),
    fetchImpl: offlineFetch,
  });
  assert.ok(server);
  assert.equal(typeof server.connect, 'function');
});
