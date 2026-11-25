/**
 * @file Shared TypeScript contracts for the HyperDrop monorepo.
 *
 * Bridges:
 *  - Soroban smart contract (`/contracts/yield-guard` — `YieldGuardPolicy`)
 *  - Deterministic risk engine, MCP server & Gemini agent (`/packages/agent-core`)
 *  - Non-custodial Next.js copilot UI (`/apps/web`)
 *
 * Financial precision rule:
 *  - On-chain token amounts (`i128`) are ALWAYS serialized as base-10 integer strings (`I128String`).
 *  - Formatted decimal balances, prices, and ratios are ALWAYS serialized as `DecimalString`.
 *  - Basis points (`BasisPoints`) are integers where `10_000 = 1.00x = 100.00%`.
 */

// ---------------------------------------------------------------------------
// 1. Stellar & Financial Primitives
// ---------------------------------------------------------------------------

export type StellarNetwork = 'TESTNET' | 'MAINNET';

/** Stellar Ed25519 account public key (`G...`, 56-character StrKey). */
export type StellarAccountAddress = string;

/** Soroban smart contract address (`C...`, 56-character StrKey). */
export type SorobanContractId = string;

/** Base-10 signed integer string mirroring Soroban `i128` atomic token units (7 decimals on Stellar). */
export type I128String = string;

/** Deterministic decimal string produced by `BigInt` or `decimal.js` (never raw float math). */
export type DecimalString = string;

/** Integer basis points (`10_000` = 1.00x or 100.00%, `15_000` = 1.50x, `12_500` = 1.25x). */
export type BasisPoints = number;

/** Ledger unix timestamp in seconds (mirrors Soroban `u64`). */
export type UnixTimestampSec = number;

export const STELLAR_NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  TESTNET: 'Test SDF Network ; September 2015',
  MAINNET: 'Public Global Stellar Network ; September 2015',
};

export const STELLAR_ASSET_DECIMALS = 7 as const;
export const STROOPS_PER_UNIT = 10_000_000n;
export const BPS_SCALE = 10_000 as const;

/**
 * Semantic Health Factor thresholds (basis points) mapped directly to OKLCH UI risk bands:
 *  - `> 15_000` (1.50x) -> `safe` (Emerald)
 *  - `12_500..=15_000` (1.25x..1.50x) -> `caution` (Amber)
 *  - `< 12_500` (< 1.25x) -> `danger` (Crimson)
 */
export const HEALTH_FACTOR_THRESHOLDS_BPS = {
  SAFE_EXCLUSIVE_MIN: 15_000,
  CAUTION_INCLUSIVE_MIN: 12_500,
  LIQUIDATION: 10_000,
} as const;

export type HealthRiskBand = 'safe' | 'caution' | 'danger';

export function classifyHealthRisk(healthFactorBps: BasisPoints): HealthRiskBand {
  if (healthFactorBps > HEALTH_FACTOR_THRESHOLDS_BPS.SAFE_EXCLUSIVE_MIN) {
    return 'safe';
  }
  if (healthFactorBps >= HEALTH_FACTOR_THRESHOLDS_BPS.CAUTION_INCLUSIVE_MIN) {
    return 'caution';
  }
  return 'danger';
}

// ---------------------------------------------------------------------------
// 2. Soroban YieldGuardPolicy On-Chain Contract Mirror
// ---------------------------------------------------------------------------

/**
 * Mirrors the `#[contracterror]` enum in `/contracts/yield-guard/src/errors.rs`.
 */
export enum YieldGuardErrorCode {
  AlreadyInitialized = 1,
  NotInitialized = 2,
  GuardPaused = 3,
  UnauthorizedProtocol = 4,
  SingleTxLimitExceeded = 5,
  DailyLimitExceeded = 6,
  HealthFactorBelowMinimum = 7,
  InvalidAmount = 8,
  InvalidConfig = 9,
  ArithmeticOverflow = 10,
  Unauthorized = 11,
}

/**
 * Exact 1:1 TypeScript mirror of Soroban Persistent Storage struct `YieldGuardPolicy`.
 */
export interface YieldGuardPolicy {
  readonly owner: StellarAccountAddress;
  readonly agentSigner: StellarAccountAddress;
  readonly maxSingleTxAmount: I128String;
  readonly dailySpendLimit: I128String;
  readonly spentInWindow: I128String;
  readonly windowStart: UnixTimestampSec;
  readonly minHealthFactorBps: BasisPoints;
  readonly allowedProtocols: readonly SorobanContractId[];
  readonly isPaused: boolean;
}

/**
 * Payload sent from `/apps/web` GuardrailDrawer when updating on-chain policy rules.
 */
export interface UpdateYieldGuardRulesInput {
  readonly owner: StellarAccountAddress;
  readonly agentSigner: StellarAccountAddress;
  readonly maxSingleTxAmount: I128String;
  readonly dailySpendLimit: I128String;
  readonly minHealthFactorBps: BasisPoints;
  readonly allowedProtocols: readonly SorobanContractId[];
}

export type GuardrailComplianceStatus = 'compliant' | 'blocked' | 'paused';

export type GuardrailRuleId =
  | 'pause_state'
  | 'protocol_allowlist'
  | 'single_tx_cap'
  | 'daily_spend_cap'
  | 'min_health_factor';

export interface GuardrailCheckItem {
  readonly rule: GuardrailRuleId;
  readonly passed: boolean;
  readonly label: string;
  readonly observed: string;
  readonly limit: string;
  readonly errorCode?: YieldGuardErrorCode;
}

export interface GuardrailEvaluation {
  readonly status: GuardrailComplianceStatus;
  readonly policyContractId: SorobanContractId;
  readonly checkedAt: string;
  readonly remainingDailyAllowanceAtomic: I128String;
  readonly remainingDailyAllowanceFormatted: DecimalString;
  readonly dailyCapUtilizationAfterTxBps: BasisPoints;
  readonly checks: readonly GuardrailCheckItem[];
}

// ---------------------------------------------------------------------------
// 3. Stellar DeFi Protocol Domain Models (Blend, DeFindex, Soroswap)
// ---------------------------------------------------------------------------

export type ProtocolId = 'blend' | 'defindex' | 'soroswap' | 'yield_guard';

export interface AssetDescriptor {
  readonly code: string;
  readonly symbol: string;
  readonly contractId: SorobanContractId;
  readonly decimals: number;
  readonly usdPrice: DecimalString;
}

export interface BlendPosition {
  readonly poolId: SorobanContractId;
  readonly poolName: string;
  readonly asset: AssetDescriptor;
  readonly collateralAtomic: I128String;
  readonly collateralFormatted: DecimalString;
  readonly collateralUsd: DecimalString;
  readonly collateralFactorBps: BasisPoints;
  readonly debtAtomic: I128String;
  readonly debtFormatted: DecimalString;
  readonly debtUsd: DecimalString;
  readonly liabilityFactorBps: BasisPoints;
  readonly supplyApyBps: BasisPoints;
  readonly borrowApyBps: BasisPoints;
}

export interface PortfolioHealthSnapshot {
  readonly owner: StellarAccountAddress;
  readonly network: StellarNetwork;
  readonly fetchedAt: string;
  readonly totalCollateralUsd: DecimalString;
  readonly totalRiskAdjustedCollateralUsd: DecimalString;
  readonly totalDebtUsd: DecimalString;
  readonly totalRiskAdjustedDebtUsd: DecimalString;
  readonly healthFactorBps: BasisPoints;
  readonly healthFactorFormatted: DecimalString;
  readonly riskBand: HealthRiskBand;
  readonly liquidationPriceDropPct: DecimalString;
  readonly netApyBps: BasisPoints;
  readonly positions: readonly BlendPosition[];
}

export interface DeFindexVaultQuote {
  readonly vaultId: SorobanContractId;
  readonly vaultName: string;
  readonly asset: AssetDescriptor;
  readonly grossApyBps: BasisPoints;
  readonly protocolFeeBps: BasisPoints;
  readonly estimatedSorobanFeeXlm: DecimalString;
  readonly estimatedSorobanFeeUsd: DecimalString;
  readonly netApyBps: BasisPoints;
  readonly netApyDeltaBps: number;
  readonly tvlUsd: DecimalString;
  readonly strategies: readonly string[];
  readonly allowlistedInGuard: boolean;
}

export interface DeFindexYieldComparison {
  readonly owner: StellarAccountAddress;
  readonly evaluatedAmountAtomic: I128String;
  readonly evaluatedAmountFormatted: DecimalString;
  readonly horizonDays: number;
  readonly currentBlendSupplyApyBps: BasisPoints;
  readonly bestVaultId: SorobanContractId | null;
  readonly quotes: readonly DeFindexVaultQuote[];
  readonly fetchedAt: string;
}

// ---------------------------------------------------------------------------
// 4. Exact TransactionProposal Schema (AI Agent <-> /apps/web)
// ---------------------------------------------------------------------------

export const TRANSACTION_PROPOSAL_SCHEMA_VERSION = '1.0.0' as const;

export type ProposalActionType =
  | 'repay_debt'
  | 'add_collateral'
  | 'rebalance_vault'
  | 'swap_and_repay'
  | 'pause_guard'
  | 'unpause_guard'
  | 'update_guard_rules';

export type BalanceDiffDirection = 'inflow' | 'outflow';

export interface TokenBalanceDiff {
  readonly asset: AssetDescriptor;
  readonly direction: BalanceDiffDirection;
  readonly amountAtomic: I128String;
  readonly amountFormatted: DecimalString;
  readonly usdValue: DecimalString;
  readonly counterpartyProtocol: ProtocolId;
  readonly counterpartyContractId: SorobanContractId;
}

export interface HealthFactorTransition {
  readonly beforeBps: BasisPoints;
  readonly beforeFormatted: DecimalString;
  readonly beforeBand: HealthRiskBand;
  readonly afterBps: BasisPoints;
  readonly afterFormatted: DecimalString;
  readonly afterBand: HealthRiskBand;
  readonly deltaBps: number;
  readonly liquidationDropBeforePct: DecimalString;
  readonly liquidationDropAfterPct: DecimalString;
}

export type SimulationStatus = 'verified' | 'failed';

export interface SorobanSimulationSummary {
  readonly status: SimulationStatus;
  readonly simulatedAt: string;
  readonly rpcUrl: string;
  readonly minResourceFeeStroops: I128String;
  readonly recommendedFeeStroops: I128String;
  readonly recommendedFeeXlm: DecimalString;
  readonly recommendedFeeUsd: DecimalString;
  readonly cpuInstructions: number;
  readonly readBytes: number;
  readonly writeBytes: number;
  readonly latestLedger: number;
  readonly errorMessage?: string;
}

/**
 * Canonical non-custodial transaction proposal produced by `/packages/agent-core`
 * and rendered by `/apps/web` `TxPreviewCard` for user inspection and wallet signing.
 */
export interface TransactionProposal {
  readonly schemaVersion: typeof TRANSACTION_PROPOSAL_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly network: StellarNetwork;
  readonly networkPassphrase: string;
  readonly ownerAddress: StellarAccountAddress;
  readonly actionType: ProposalActionType;
  readonly title: string;
  readonly summary: string;
  /** Action-specific button copy (e.g., "Approve & Sign Repay · 500 USDC"). */
  readonly ctaLabel: string;
  readonly targetProtocol: ProtocolId;
  readonly targetContractId: SorobanContractId;
  /** Base64-encoded unsigned Soroban TransactionEnvelope XDR ready for wallet signing. */
  readonly unsignedXdr: string;
  readonly tokenDiffs: readonly TokenBalanceDiff[];
  readonly healthFactor: HealthFactorTransition;
  /** Signed basis points delta for expected net yield after Soroban fees. */
  readonly netApyDeltaBps?: number;
  readonly simulation: SorobanSimulationSummary;
  readonly guardrail: GuardrailEvaluation;
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// 5. Agent Chat & Streaming Wire Protocol (/apps/web/src/app/api/chat/route.ts)
// ---------------------------------------------------------------------------

export type CopilotRole = 'user' | 'assistant';

export type AgentToolName =
  | 'get_portfolio_health'
  | 'compare_defindex_yields'
  | 'simulate_rebalance_or_repay';

export interface AgentToolTrace {
  readonly id: string;
  readonly toolName: AgentToolName;
  readonly status: 'running' | 'completed' | 'error';
  readonly durationMs?: number;
  readonly summary?: string;
}

export interface CopilotMessage {
  readonly id: string;
  readonly role: CopilotRole;
  readonly content: string;
  readonly createdAt: string;
  readonly toolTraces?: readonly AgentToolTrace[];
  readonly proposal?: TransactionProposal;
}

export interface CopilotChatRequest {
  readonly walletAddress: StellarAccountAddress;
  readonly network: StellarNetwork;
  readonly messages: readonly Pick<CopilotMessage, 'role' | 'content'>[];
  readonly policySnapshot?: YieldGuardPolicy;
}

export type CopilotStreamEvent =
  | { readonly type: 'text_delta'; readonly delta: string }
  | { readonly type: 'tool_trace'; readonly trace: AgentToolTrace }
  | { readonly type: 'proposal'; readonly proposal: TransactionProposal }
  | { readonly type: 'error'; readonly message: string; readonly code?: string }
  | { readonly type: 'done' };

// ---------------------------------------------------------------------------
// 6. Runtime Boundary Validators (Zero-Dependency Pure Guards)
// ---------------------------------------------------------------------------

const STELLAR_G_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const SOROBAN_C_ID_REGEX = /^C[A-Z2-7]{55}$/;
const SIGNED_INT_REGEX = /^-?(?:0|[1-9]\d*)$/;

const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;

const VALID_NETWORKS: ReadonlySet<string> = new Set<StellarNetwork>(['TESTNET', 'MAINNET']);
const VALID_RISK_BANDS: ReadonlySet<string> = new Set<HealthRiskBand>(['safe', 'caution', 'danger']);
const VALID_PROTOCOLS: ReadonlySet<string> = new Set<ProtocolId>([
  'blend',
  'defindex',
  'soroswap',
  'yield_guard',
]);
const VALID_ACTIONS: ReadonlySet<string> = new Set<ProposalActionType>([
  'repay_debt',
  'add_collateral',
  'rebalance_vault',
  'swap_and_repay',
  'pause_guard',
  'unpause_guard',
  'update_guard_rules',
]);
const VALID_GUARDRAIL_STATUSES: ReadonlySet<string> = new Set<GuardrailComplianceStatus>([
  'compliant',
  'blocked',
  'paused',
]);

export function isValidStellarPublicKey(value: unknown): value is StellarAccountAddress {
  return typeof value === 'string' && STELLAR_G_KEY_REGEX.test(value);
}

export function isValidSorobanContractId(value: unknown): value is SorobanContractId {
  return typeof value === 'string' && SOROBAN_C_ID_REGEX.test(value);
}

export function isI128String(value: unknown): value is I128String {
  if (typeof value !== 'string' || !SIGNED_INT_REGEX.test(value)) {
    return false;
  }
  try {
    const parsed = BigInt(value);
    return parsed >= I128_MIN && parsed <= I128_MAX;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTokenBalanceDiff(value: unknown): value is TokenBalanceDiff {
  if (!isRecord(value) || !isRecord(value.asset)) {
    return false;
  }
  const asset = value.asset;
  return (
    isNonEmptyString(asset.code) &&
    isNonEmptyString(asset.symbol) &&
    isValidSorobanContractId(asset.contractId) &&
    Number.isInteger(asset.decimals) &&
    (asset.decimals as number) >= 0 &&
    isNonEmptyString(asset.usdPrice) &&
    (value.direction === 'inflow' || value.direction === 'outflow') &&
    isI128String(value.amountAtomic) &&
    isNonEmptyString(value.amountFormatted) &&
    isNonEmptyString(value.usdValue) &&
    typeof value.counterpartyProtocol === 'string' &&
    VALID_PROTOCOLS.has(value.counterpartyProtocol) &&
    isValidSorobanContractId(value.counterpartyContractId)
  );
}

function isHealthFactorTransition(value: unknown): value is HealthFactorTransition {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Number.isInteger(value.beforeBps) &&
    (value.beforeBps as number) >= 0 &&
    isNonEmptyString(value.beforeFormatted) &&
    typeof value.beforeBand === 'string' &&
    VALID_RISK_BANDS.has(value.beforeBand) &&
    Number.isInteger(value.afterBps) &&
    (value.afterBps as number) >= 0 &&
    isNonEmptyString(value.afterFormatted) &&
    typeof value.afterBand === 'string' &&
    VALID_RISK_BANDS.has(value.afterBand) &&
    Number.isInteger(value.deltaBps) &&
    isNonEmptyString(value.liquidationDropBeforePct) &&
    isNonEmptyString(value.liquidationDropAfterPct)
  );
}

function isSimulationSummary(value: unknown): value is SorobanSimulationSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.status === 'verified' || value.status === 'failed') &&
    isNonEmptyString(value.simulatedAt) &&
    isNonEmptyString(value.rpcUrl) &&
    isI128String(value.minResourceFeeStroops) &&
    isI128String(value.recommendedFeeStroops) &&
    isNonEmptyString(value.recommendedFeeXlm) &&
    isNonEmptyString(value.recommendedFeeUsd) &&
    isFiniteNumber(value.cpuInstructions) &&
    isFiniteNumber(value.readBytes) &&
    isFiniteNumber(value.writeBytes) &&
    isFiniteNumber(value.latestLedger) &&
    (value.errorMessage === undefined || typeof value.errorMessage === 'string')
  );
}

function isGuardrailEvaluation(value: unknown): value is GuardrailEvaluation {
  if (!isRecord(value) || !Array.isArray(value.checks)) {
    return false;
  }
  return (
    typeof value.status === 'string' &&
    VALID_GUARDRAIL_STATUSES.has(value.status) &&
    isValidSorobanContractId(value.policyContractId) &&
    isNonEmptyString(value.checkedAt) &&
    isI128String(value.remainingDailyAllowanceAtomic) &&
    isNonEmptyString(value.remainingDailyAllowanceFormatted) &&
    Number.isInteger(value.dailyCapUtilizationAfterTxBps) &&
    value.checks.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.rule) &&
        typeof item.passed === 'boolean' &&
        isNonEmptyString(item.label) &&
        typeof item.observed === 'string' &&
        typeof item.limit === 'string',
    )
  );
}

/**
 * Validates that an unknown JSON payload parsed from the AI agent strictly conforms
 * to the `TransactionProposal` contract before `/apps/web` renders a signing card.
 */
export function isTransactionProposal(value: unknown): value is TransactionProposal {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.schemaVersion === TRANSACTION_PROPOSAL_SCHEMA_VERSION &&
    isNonEmptyString(value.proposalId) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.expiresAt) &&
    typeof value.network === 'string' &&
    VALID_NETWORKS.has(value.network) &&
    isNonEmptyString(value.networkPassphrase) &&
    isValidStellarPublicKey(value.ownerAddress) &&
    typeof value.actionType === 'string' &&
    VALID_ACTIONS.has(value.actionType) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.summary) &&
    isNonEmptyString(value.ctaLabel) &&
    typeof value.targetProtocol === 'string' &&
    VALID_PROTOCOLS.has(value.targetProtocol) &&
    isValidSorobanContractId(value.targetContractId) &&
    isNonEmptyString(value.unsignedXdr) &&
    Array.isArray(value.tokenDiffs) &&
    value.tokenDiffs.every(isTokenBalanceDiff) &&
    isHealthFactorTransition(value.healthFactor) &&
    (value.netApyDeltaBps === undefined || Number.isInteger(value.netApyDeltaBps)) &&
    isSimulationSummary(value.simulation) &&
    isGuardrailEvaluation(value.guardrail) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((w) => typeof w === 'string')
  );
}
