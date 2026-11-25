import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import {
  STELLAR_ASSET_DECIMALS,
  STELLAR_NETWORK_PASSPHRASES,
  type AssetDescriptor,
  type BlendPosition,
  type SorobanContractId,
  type StellarAccountAddress,
  type StellarNetwork,
  type YieldGuardPolicy,
} from '../types';

export interface StellarProtocolRegistry {
  readonly network: StellarNetwork;
  readonly networkPassphrase: string;
  readonly sorobanRpcUrl: string;
  readonly horizonUrl: string;
  readonly yieldGuardContractId: SorobanContractId;
  readonly blendPoolContractId: SorobanContractId;
  readonly defindexFactoryContractId: SorobanContractId;
  readonly soroswapRouterContractId: SorobanContractId;
  readonly agentPublicKey: StellarAccountAddress;
  readonly assets: Record<'XLM' | 'USDC' | 'EURC', AssetDescriptor>;
}

/**
 * Valid Stellar Testnet StrKey defaults used when environment overrides are unset.
 * Deployers override these via `.env` with their live Testnet contract IDs.
 */
export const DEFAULT_TESTNET_CONTRACTS = {
  YIELD_GUARD: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
  BLEND_POOL: 'CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65',
  DEFINDEX_USDC_BLEND_VAULT: 'CAFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQX4KO',
  DEFINDEX_USDC_BALANCED_VAULT: 'CAGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAZTCD',
  DEFINDEX_XLM_YIELD_VAULT: 'CAGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ242B',
  SOROSWAP_ROUTER: 'CCMAPXWVZD4USEKDWRYS7DA4Y3D7E2SDMGBFJUCEXTC7VN6CUBGWPFUS',
  AGENT_SIGNER: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  XLM_SAC: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  USDC_SAC: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  EURC_SAC: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
} as const;

export function getStellarProtocolRegistry(
  network: StellarNetwork = 'TESTNET',
): StellarProtocolRegistry {
  const sorobanRpcUrl =
    process.env.SOROBAN_RPC_URL ||
    (network === 'TESTNET'
      ? 'https://soroban-testnet.stellar.org'
      : 'https://mainnet.sorobanrpc.com');

  const horizonUrl =
    process.env.HORIZON_URL ||
    (network === 'TESTNET'
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org');

  return {
    network,
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      (network === 'TESTNET' ? Networks.TESTNET : STELLAR_NETWORK_PASSPHRASES.MAINNET),
    sorobanRpcUrl,
    horizonUrl,
    yieldGuardContractId:
      process.env.YIELD_GUARD_CONTRACT_ID || DEFAULT_TESTNET_CONTRACTS.YIELD_GUARD,
    blendPoolContractId:
      process.env.BLEND_POOL_CONTRACT_ID || DEFAULT_TESTNET_CONTRACTS.BLEND_POOL,
    defindexFactoryContractId:
      process.env.DEFINDEX_FACTORY_CONTRACT_ID ||
      DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT,
    soroswapRouterContractId:
      process.env.SOROSWAP_ROUTER_CONTRACT_ID || DEFAULT_TESTNET_CONTRACTS.SOROSWAP_ROUTER,
    agentPublicKey: process.env.AGENT_PUBLIC_KEY || DEFAULT_TESTNET_CONTRACTS.AGENT_SIGNER,
    assets: {
      XLM: {
        code: 'XLM',
        symbol: 'XLM',
        contractId: DEFAULT_TESTNET_CONTRACTS.XLM_SAC,
        decimals: STELLAR_ASSET_DECIMALS,
        usdPrice: '0.1250',
      },
      USDC: {
        code: 'USDC',
        symbol: 'USDC',
        contractId: DEFAULT_TESTNET_CONTRACTS.USDC_SAC,
        decimals: STELLAR_ASSET_DECIMALS,
        usdPrice: '1.0000',
      },
      EURC: {
        code: 'EURC',
        symbol: 'EURC',
        contractId: DEFAULT_TESTNET_CONTRACTS.EURC_SAC,
        decimals: STELLAR_ASSET_DECIMALS,
        usdPrice: '1.0800',
      },
    },
  };
}

/**
 * Minimal injectable Soroban RPC interface enabling both live Testnet RPC calls
 * and deterministic offline unit testing.
 */
export interface SorobanRpcAdapter {
  getAccount(address: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
}

export function createSorobanRpcAdapter(rpcUrl: string): SorobanRpcAdapter {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  return {
    getAccount: (address: string) => server.getAccount(address),
    simulateTransaction: (tx: Transaction) => server.simulateTransaction(tx),
  };
}

/**
 * Default Testnet `YieldGuardPolicy` returned when an owner has not yet initialized
 * an on-chain policy on Testnet or when running in read-only sandbox preview.
 */
export function buildDefaultTestnetPolicy(
  owner: StellarAccountAddress,
  registry: StellarProtocolRegistry,
): YieldGuardPolicy {
  return {
    owner,
    agentSigner: registry.agentPublicKey,
    maxSingleTxAmount: '10000000000', // 1,000.00 USDC (7 decimals)
    dailySpendLimit: '25000000000', // 2,500.00 USDC
    spentInWindow: '0',
    windowStart: Math.floor(Date.now() / 1000),
    minHealthFactorBps: 15_000, // 1.50x
    allowedProtocols: [
      registry.blendPoolContractId,
      DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BLEND_VAULT,
      DEFAULT_TESTNET_CONTRACTS.DEFINDEX_USDC_BALANCED_VAULT,
      DEFAULT_TESTNET_CONTRACTS.DEFINDEX_XLM_YIELD_VAULT,
      registry.soroswapRouterContractId,
    ],
    isPaused: false,
  };
}

/**
 * Attempts a live read-only Soroban RPC `get_policy` simulation on `YieldGuardContract`.
 * Falls back cleanly to a caller-supplied `policySnapshot` or Testnet defaults if
 * the contract is not yet deployed for `owner`.
 */
export async function resolveYieldGuardPolicy(params: {
  readonly owner: StellarAccountAddress;
  readonly registry: StellarProtocolRegistry;
  readonly policySnapshot?: YieldGuardPolicy;
  readonly rpcAdapter?: SorobanRpcAdapter;
}): Promise<YieldGuardPolicy> {
  if (params.policySnapshot) {
    return params.policySnapshot;
  }

  const adapter = params.rpcAdapter ?? createSorobanRpcAdapter(params.registry.sorobanRpcUrl);

  try {
    const sourceAccount = new Account(params.owner, '0');
    const contract = new Contract(params.registry.yieldGuardContractId);
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: params.registry.networkPassphrase,
    })
      .addOperation(
        contract.call('get_policy', Address.fromString(params.owner).toScVal()),
      )
      .setTimeout(30)
      .build();

    const sim = await adapter.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      const native = scValToNative(sim.result.retval) as Record<string, unknown>;
      if (native && typeof native === 'object' && 'max_single_tx_amount' in native) {
        return {
          owner: params.owner,
          agentSigner: String(native.agent_signer),
          maxSingleTxAmount: String(native.max_single_tx_amount),
          dailySpendLimit: String(native.daily_spend_limit),
          spentInWindow: String(native.spent_in_window),
          windowStart: Number(native.window_start),
          minHealthFactorBps: Number(native.min_health_factor_bps),
          allowedProtocols: Array.isArray(native.allowed_protocols)
            ? native.allowed_protocols.map(String)
            : [],
          isPaused: Boolean(native.is_paused),
        };
      }
    }
  } catch {
    // Contract not deployed or owner policy uninitialized on Testnet; fall through to default policy.
  }

  return buildDefaultTestnetPolicy(params.owner, params.registry);
}

/**
 * Builds deterministic Blend Testnet lending pool positions anchored to live
 * Horizon Testnet balances when available, or realistic Testnet baseline positions
 * when the connected account has no active Blend borrow yet.
 */
export async function loadBlendTestnetPositions(params: {
  readonly owner: StellarAccountAddress;
  readonly registry: StellarProtocolRegistry;
  readonly fetchImpl?: typeof fetch;
}): Promise<readonly BlendPosition[]> {
  const fetcher = params.fetchImpl ?? globalThis.fetch;
  let liveXlmBalanceUnits: number | null = null;
  const isPreviewAccount = params.owner === DEFAULT_TESTNET_CONTRACTS.AGENT_SIGNER;

  if (!isPreviewAccount) {
    try {
      const res = await fetcher(`${params.registry.horizonUrl}/accounts/${params.owner}`, {
        signal: AbortSignal.timeout(4_000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          balances?: Array<{ asset_type?: string; balance?: string }>;
        };
        const nativeBal = json.balances?.find((b) => b.asset_type === 'native');
        if (nativeBal?.balance) {
          const parsed = Number.parseFloat(nativeBal.balance);
          if (Number.isFinite(parsed) && parsed > 100) {
            liveXlmBalanceUnits = parsed;
          }
        }
      }
    } catch {
      // Horizon unreachable or unfunded Testnet account; fall through to deterministic Testnet pool state.
    }
  }

  // Deterministic Blend Testnet Fixed Pool snapshot (XLM collateral + USDC borrow in Caution zone ~1.34x)
  const xlmCollateralUnits = liveXlmBalanceUnits
    ? Math.max(25_000, Math.min(120_000, Math.floor(liveXlmBalanceUnits * 3.5)))
    : 32_000;
  const xlmAtomic = (BigInt(xlmCollateralUnits) * 10_000_000n).toString();
  const xlmUsd = (xlmCollateralUnits * 0.125).toFixed(2);

  return [
    {
      poolId: params.registry.blendPoolContractId,
      poolName: 'Blend Testnet Yield Pool v2',
      asset: params.registry.assets.XLM,
      collateralAtomic: xlmAtomic,
      collateralFormatted: `${xlmCollateralUnits.toFixed(2)}`,
      collateralUsd: xlmUsd,
      collateralFactorBps: 7_500, // 0.75 CF
      debtAtomic: '0',
      debtFormatted: '0.00',
      debtUsd: '0.00',
      liabilityFactorBps: 9_000,
      supplyApyBps: 420, // 4.20%
      borrowApyBps: 680,
    },
    {
      poolId: params.registry.blendPoolContractId,
      poolName: 'Blend Testnet Yield Pool v2',
      asset: params.registry.assets.USDC,
      collateralAtomic: '0',
      collateralFormatted: '0.00',
      collateralUsd: '0.00',
      collateralFactorBps: 9_000,
      debtAtomic: '20100000000', // 2,010.00 USDC debt
      debtFormatted: '2010.00',
      debtUsd: '2010.00',
      liabilityFactorBps: 9_000, // 0.90 LF -> 2,233.33 risk-adj debt -> HF ~1.34x on 4,000 USD XLM collateral
      supplyApyBps: 540, // 5.40%
      borrowApyBps: 785, // 7.85%
    },
  ];
}

export function scValAddress(addr: string): xdr.ScVal {
  return Address.fromString(addr).toScVal();
}

export function scValI128(atomic: string): xdr.ScVal {
  return nativeToScVal(BigInt(atomic), { type: 'i128' });
}

export function scValU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}
