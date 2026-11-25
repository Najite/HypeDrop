import crypto from 'node:crypto';
import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import {
  compareDefindexYields,
  type CompareDefindexYieldsInput,
} from './tools/compare-defindex-yields';
import {
  getPortfolioHealth,
  type GetPortfolioHealthInput,
} from './tools/get-portfolio-health';
import {
  simulateRebalanceOrRepay,
  type SimulateRebalanceOrRepayInput,
} from './tools/simulate-rebalance-or-repay';
import type { SorobanRpcAdapter } from './tools/stellar-context';
import {
  isTransactionProposal,
  type AgentToolName,
  type BlendPosition,
  type CopilotChatRequest,
  type CopilotStreamEvent,
  type TransactionProposal,
} from './types';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export const HYPERDROP_SYSTEM_PROMPT = `You are HyperDrop, an institutional-grade, non-custodial AI DeFi risk-protection copilot for the Stellar network (Blend lending pools, DeFindex yield vaults, and Soroswap).

STRICT SAFETY & PRECISION PROTOCOL:
1. Non-Custodial Only: NEVER ask for seed phrases, secret keys (S...), or wallet passwords. Every transaction is prepared as an unsigned Soroban XDR for the user to inspect and sign in their wallet.
2. Zero LLM Financial Math: NEVER compute Health Factors, liquidation distances, APY deltas, or token amounts in your head. ALWAYS call the deterministic tools:
   - \`get_portfolio_health\` to inspect Blend positions, Health Factor, liquidation price drop buffer, and YieldGuardPolicy rules.
   - \`compare_defindex_yields\` to evaluate DeFindex vault yields and net APY delta after Soroban fees.
   - \`simulate_rebalance_or_repay\` to build an unsigned Soroban transaction, run RPC preflight simulation, verify YieldGuardPolicy limits, and produce the canonical \`TransactionProposal\` JSON.
3. On-Chain Guardrail Respect: If \`simulate_rebalance_or_repay\` returns \`guardrail.status === "blocked"\` or \`"paused"\`, clearly state which exact YieldGuardPolicy rule blocked execution (e.g., Emergency Freeze active, single-tx cap, 24h rolling limit, protocol allowlist, or minimum health factor) and NEVER suggest bypassing safety limits.
4. Concise Institutional Prose: Report exact numbers returned by the tools (Health Factor before → after, liquidation drop buffer, net APY delta, Soroban fee in XLM/USD). Do NOT dump raw base64 XDR strings into prose—the UI renders the \`TransactionProposal\` card automatically.
5. Explicit Action Grounding: Only claim a transaction is simulated and ready to sign—never state that funds have moved on-chain until the user signs and submits in their wallet.`;

export const HYPERDROP_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_portfolio_health',
    description:
      'Fetch the connected Stellar account Blend lending positions, deterministic Health Factor, liquidation drop buffer, net APY, active YieldGuardPolicy rules, and recommended USDC repay amount to reach safe zone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        walletAddress: {
          type: Type.STRING,
          description: 'Stellar Ed25519 public key (G..., 56 chars).',
        },
        network: {
          type: Type.STRING,
          description: 'Stellar network: TESTNET or MAINNET. Defaults to TESTNET.',
          enum: ['TESTNET', 'MAINNET'],
        },
      },
      required: ['walletAddress'],
    },
  },
  {
    name: 'compare_defindex_yields',
    description:
      'Compare DeFindex yield vaults for an asset and principal amount, returning deterministic net APY and net APY delta after protocol fees and annualized Soroban transaction fees, plus YieldGuardPolicy allowlist status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        walletAddress: {
          type: Type.STRING,
          description: 'Stellar Ed25519 public key (G..., 56 chars).',
        },
        assetCode: {
          type: Type.STRING,
          description: 'Asset symbol to evaluate: USDC, XLM, or EURC.',
          enum: ['USDC', 'XLM', 'EURC'],
        },
        amount: {
          type: Type.STRING,
          description: 'Positive decimal string amount to evaluate (e.g. "1000.00").',
        },
        horizonDays: {
          type: Type.INTEGER,
          description: 'Holding horizon in days used to amortize Soroban fees (1-365, default 90).',
        },
        network: {
          type: Type.STRING,
          enum: ['TESTNET', 'MAINNET'],
        },
      },
      required: ['walletAddress', 'assetCode', 'amount'],
    },
  },
  {
    name: 'simulate_rebalance_or_repay',
    description:
      'Build an unsigned Soroban transaction for repaying Blend debt, adding collateral, swapping & repaying, or rebalancing into a DeFindex vault; simulate via Soroban RPC; verify YieldGuardPolicy limits; and output a structured TransactionProposal JSON.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        walletAddress: {
          type: Type.STRING,
          description: 'Stellar Ed25519 public key (G..., 56 chars).',
        },
        actionType: {
          type: Type.STRING,
          description: 'DeFi action to simulate.',
          enum: ['repay_debt', 'add_collateral', 'rebalance_vault', 'swap_and_repay'],
        },
        assetCode: {
          type: Type.STRING,
          description: 'Primary asset for the action: USDC, XLM, or EURC.',
          enum: ['USDC', 'XLM', 'EURC'],
        },
        amount: {
          type: Type.STRING,
          description: 'Positive decimal string amount (e.g. "500.00").',
        },
        targetProtocol: {
          type: Type.STRING,
          description: 'Target protocol: blend, defindex, or soroswap.',
          enum: ['blend', 'defindex', 'soroswap'],
        },
        targetContractId: {
          type: Type.STRING,
          description: 'Optional explicit Soroban C... contract ID.',
        },
        swapFromAssetCode: {
          type: Type.STRING,
          description: 'Optional source asset when actionType is swap_and_repay.',
          enum: ['USDC', 'XLM', 'EURC'],
        },
        network: {
          type: Type.STRING,
          enum: ['TESTNET', 'MAINNET'],
        },
      },
      required: ['walletAddress', 'actionType', 'assetCode', 'amount', 'targetProtocol'],
    },
  },
];

export interface HyperDropAgentOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly maxToolRounds?: number;
  readonly rpcAdapter?: SorobanRpcAdapter;
  readonly positionsOverride?: readonly BlendPosition[];
  readonly fetchImpl?: typeof fetch;
}

export function createGeminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure GEMINI_API_KEY in server environment secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('econnreset')
  );
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxAttempts: number = 3,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isRetryableGeminiError(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function summarizeToolOutput(name: AgentToolName, output: unknown): string {
  if (name === 'get_portfolio_health' && output && typeof output === 'object' && 'snapshot' in output) {
    const res = output as Awaited<ReturnType<typeof getPortfolioHealth>>;
    return `Blend HF ${res.snapshot.healthFactorFormatted}x (${res.snapshot.riskBand.toUpperCase()}) · Debt $${res.snapshot.totalDebtUsd}`;
  }
  if (name === 'compare_defindex_yields' && output && typeof output === 'object' && 'quotes' in output) {
    const res = output as Awaited<ReturnType<typeof compareDefindexYields>>;
    const top = res.quotes[0];
    return top
      ? `Top vault ${(top.netApyBps / 100).toFixed(2)}% net APY (${top.netApyDeltaBps >= 0 ? '+' : ''}${(top.netApyDeltaBps / 100).toFixed(2)}% delta)`
      : 'No matching vaults found';
  }
  if (name === 'simulate_rebalance_or_repay' && isTransactionProposal(output)) {
    return `${output.title} · HF ${output.healthFactor.beforeFormatted}x → ${output.healthFactor.afterFormatted}x · Guard ${output.guardrail.status}`;
  }
  return 'Completed';
}

/**
 * Runs the HyperDrop multi-turn Gemini function-calling agent and yields
 * structured `CopilotStreamEvent` chunks for SSE/NDJSON streaming to `/apps/web`.
 */
export async function* runHyperDropAgent(
  request: CopilotChatRequest,
  options: HyperDropAgentOptions = {},
): AsyncGenerator<CopilotStreamEvent> {
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const maxToolRounds = options.maxToolRounds ?? 5;

  let ai: GoogleGenAI;
  try {
    ai = createGeminiClient(options.apiKey);
  } catch (err) {
    yield {
      type: 'error',
      code: 'API_KEY_MISSING',
      message: err instanceof Error ? err.message : 'Missing GEMINI_API_KEY configuration',
    };
    yield { type: 'done' };
    return;
  }

  const contextHeader = [
    `Connected Wallet: ${request.walletAddress}`,
    `Network: ${request.network}`,
    request.policySnapshot
      ? `Active YieldGuardPolicy Snapshot: paused=${request.policySnapshot.isPaused}, minHealthFactorBps=${request.policySnapshot.minHealthFactorBps}, maxSingleTxAtomic=${request.policySnapshot.maxSingleTxAmount}, dailyLimitAtomic=${request.policySnapshot.dailySpendLimit}`
      : 'Active YieldGuardPolicy Snapshot: fetch via tool.',
  ].join('\n');

  const contents: Content[] = request.messages.map((msg, idx) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [
      {
        text:
          idx === 0 && msg.role === 'user'
            ? `[SESSION CONTEXT]\n${contextHeader}\n\n[USER REQUEST]\n${msg.content}`
            : msg.content,
      },
    ],
  }));

  let latestProposal: TransactionProposal | undefined;

  try {
    for (let round = 0; round < maxToolRounds; round++) {
      const response = await generateWithRetry(ai, {
        model,
        contents,
        config: {
          systemInstruction: HYPERDROP_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: HYPERDROP_FUNCTION_DECLARATIONS }],
        },
      });

      const modelContent = response.candidates?.[0]?.content;
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0 && modelContent) {
        // Preserve full model turn (including thoughtSignature & functionCall IDs)
        contents.push(modelContent);

        const responseParts: Part[] = [];

        for (const call of functionCalls) {
          const toolName = call.name as AgentToolName;
          const traceId = call.id ?? `trace_${crypto.randomBytes(6).toString('hex')}`;
          const startMs = Date.now();

          yield {
            type: 'tool_trace',
            trace: {
              id: traceId,
              toolName,
              status: 'running',
            },
          };

          try {
            const rawArgs = (call.args ?? {}) as Record<string, unknown>;
            const argsWithSession = {
              walletAddress: request.walletAddress,
              network: request.network,
              ...rawArgs,
            };

            let toolResult: unknown;
            if (toolName === 'get_portfolio_health') {
              toolResult = await getPortfolioHealth(
                argsWithSession as GetPortfolioHealthInput,
                {
                  policySnapshot: request.policySnapshot,
                  positionsOverride: options.positionsOverride,
                  rpcAdapter: options.rpcAdapter,
                  fetchImpl: options.fetchImpl,
                },
              );
            } else if (toolName === 'compare_defindex_yields') {
              toolResult = await compareDefindexYields(
                argsWithSession as CompareDefindexYieldsInput,
                {
                  policySnapshot: request.policySnapshot,
                  rpcAdapter: options.rpcAdapter,
                },
              );
            } else if (toolName === 'simulate_rebalance_or_repay') {
              const proposal = await simulateRebalanceOrRepay(
                argsWithSession as SimulateRebalanceOrRepayInput,
                {
                  policySnapshot: request.policySnapshot,
                  positionsOverride: options.positionsOverride,
                  rpcAdapter: options.rpcAdapter,
                  fetchImpl: options.fetchImpl,
                },
              );
              latestProposal = proposal;
              toolResult = proposal;
              yield { type: 'proposal', proposal };
            } else {
              throw new Error(`Unsupported tool invocation: ${String(call.name)}`);
            }

            const durationMs = Date.now() - startMs;
            yield {
              type: 'tool_trace',
              trace: {
                id: traceId,
                toolName,
                status: 'completed',
                durationMs,
                summary: summarizeToolOutput(toolName, toolResult),
              },
            };

            responseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: { result: toolResult },
              },
            });
          } catch (toolErr) {
            const errMessage =
              toolErr instanceof Error ? toolErr.message : 'Tool execution failed';
            yield {
              type: 'tool_trace',
              trace: {
                id: traceId,
                toolName,
                status: 'error',
                durationMs: Date.now() - startMs,
                summary: errMessage,
              },
            };
            responseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: { error: errMessage },
              },
            });
          }
        }

        contents.push({
          role: 'user',
          parts: responseParts,
        });
        continue;
      }

      const finalText = response.text?.trim() ?? '';
      if (finalText.length > 0) {
        // Stream cleanly in responsive semantic chunks
        const words = finalText.split(/(?<=\s)/);
        for (let i = 0; i < words.length; i += 4) {
          yield {
            type: 'text_delta',
            delta: words.slice(i, i + 4).join(''),
          };
        }
      } else if (latestProposal) {
        yield {
          type: 'text_delta',
          delta: latestProposal.summary,
        };
      }

      yield { type: 'done' };
      return;
    }

    yield {
      type: 'error',
      code: 'MAX_TOOL_ROUNDS_EXCEEDED',
      message: 'Agent exceeded maximum tool-execution rounds without producing a final response.',
    };
    yield { type: 'done' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini agent execution failed';
    yield {
      type: 'error',
      code: 'AGENT_EXECUTION_ERROR',
      message,
    };
    yield { type: 'done' };
  }
}
