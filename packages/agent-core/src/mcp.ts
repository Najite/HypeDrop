import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  compareDefindexYields,
  compareDefindexYieldsInputSchema,
} from './tools/compare-defindex-yields';
import {
  getPortfolioHealth,
  getPortfolioHealthInputSchema,
} from './tools/get-portfolio-health';
import {
  simulateRebalanceOrRepay,
  simulateRebalanceOrRepayInputSchema,
} from './tools/simulate-rebalance-or-repay';
import type { SorobanRpcAdapter } from './tools/stellar-context';

export interface HyperDropMcpServerDeps {
  readonly rpcAdapter?: SorobanRpcAdapter;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Constructs a Model Context Protocol (MCP) server exposing HyperDrop's
 * deterministic Stellar DeFi risk & transaction-simulation tools.
 */
export function createHyperDropMcpServer(deps: HyperDropMcpServerDeps = {}): McpServer {
  const server = new McpServer({
    name: 'hyperdrop-stellar-defi-agent',
    version: '0.1.0',
  });

  server.registerTool(
    'get_portfolio_health',
    {
      title: 'Get Stellar Blend Portfolio Health',
      description:
        'Compute deterministic Blend Health Factor, liquidation price drop distance, net APY, and active Soroban YieldGuardPolicy rules for a Stellar account.',
      inputSchema: getPortfolioHealthInputSchema,
    },
    async (args) => {
      try {
        const result = await getPortfolioHealth(args, {
          rpcAdapter: deps.rpcAdapter,
          fetchImpl: deps.fetchImpl,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: err instanceof Error ? err.message : 'Failed to fetch portfolio health',
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'compare_defindex_yields',
    {
      title: 'Compare DeFindex Vault Yields',
      description:
        'Evaluate DeFindex yield vaults on Stellar Testnet with deterministic net APY delta after protocol fees and Soroban transaction fees, checked against YieldGuardPolicy allowlist.',
      inputSchema: compareDefindexYieldsInputSchema,
    },
    async (args) => {
      try {
        const result = await compareDefindexYields(args, {
          rpcAdapter: deps.rpcAdapter,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: err instanceof Error ? err.message : 'Failed to compare DeFindex yields',
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'simulate_rebalance_or_repay',
    {
      title: 'Simulate Stellar DeFi Rebalance or Debt Repay',
      description:
        'Build an unsigned Soroban transaction via @stellar/stellar-sdk, run rpc.simulateTransaction, verify YieldGuardPolicy rules, and return the canonical TransactionProposal JSON.',
      inputSchema: simulateRebalanceOrRepayInputSchema,
    },
    async (args) => {
      try {
        const proposal = await simulateRebalanceOrRepay(args, {
          rpcAdapter: deps.rpcAdapter,
          fetchImpl: deps.fetchImpl,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(proposal, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: err instanceof Error ? err.message : 'Failed to simulate transaction',
            },
          ],
        };
      }
    },
  );

  return server;
}

export async function startHyperDropMcpStdioServer(): Promise<void> {
  const server = createHyperDropMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[hyperdrop-mcp] Stellar DeFi agent MCP server listening on stdio');
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  startHyperDropMcpStdioServer().catch((err) => {
    console.error('[hyperdrop-mcp] Fatal startup error:', err);
    process.exit(1);
  });
}
