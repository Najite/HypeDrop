import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import type {
  SorobanContractId,
  StellarAccountAddress,
  UpdateYieldGuardRulesInput,
} from '../../../../packages/agent-core/src/types';

export const TESTNET_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const TESTNET_NETWORK_PASSPHRASE = Networks.TESTNET;
export const DEFAULT_YIELD_GUARD_CONTRACT_ID: SorobanContractId =
  'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

export interface BuiltContractTx {
  readonly unsignedXdr: string;
  readonly networkPassphrase: string;
  readonly simulated: boolean;
  readonly contractId: SorobanContractId;
}

async function buildAndTryPrepareContractTx(params: {
  readonly owner: StellarAccountAddress;
  readonly contractId: SorobanContractId;
  readonly method: string;
  readonly args: xdr.ScVal[];
  readonly rpcUrl?: string;
}): Promise<BuiltContractTx> {
  const rpcUrl = params.rpcUrl ?? TESTNET_SOROBAN_RPC_URL;
  const server = new rpc.Server(rpcUrl);

  let sourceAccount: Account;
  try {
    sourceAccount = await server.getAccount(params.owner);
  } catch {
    sourceAccount = new Account(params.owner, '0');
  }

  const contract = new Contract(params.contractId);
  const rawTx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(300)
    .build();

  try {
    const sim = await server.simulateTransaction(rawTx);
    if (rpc.Api.isSimulationSuccess(sim)) {
      const assembled = rpc.assembleTransaction(rawTx, sim).build();
      return {
        unsignedXdr: assembled.toXDR(),
        networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
        simulated: true,
        contractId: params.contractId,
      };
    }
  } catch {
    // Fall back to unsigned raw XDR if contract is not yet deployed on Testnet.
  }

  return {
    unsignedXdr: rawTx.toXDR(),
    networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    simulated: false,
    contractId: params.contractId,
  };
}

export async function buildPauseGuardTx(
  owner: StellarAccountAddress,
  contractId: SorobanContractId = DEFAULT_YIELD_GUARD_CONTRACT_ID,
): Promise<BuiltContractTx> {
  return buildAndTryPrepareContractTx({
    owner,
    contractId,
    method: 'pause_guard',
    args: [Address.fromString(owner).toScVal()],
  });
}

export async function buildUnpauseGuardTx(
  owner: StellarAccountAddress,
  contractId: SorobanContractId = DEFAULT_YIELD_GUARD_CONTRACT_ID,
): Promise<BuiltContractTx> {
  return buildAndTryPrepareContractTx({
    owner,
    contractId,
    method: 'unpause_guard',
    args: [Address.fromString(owner).toScVal()],
  });
}

export async function buildUpdateRulesTx(
  input: UpdateYieldGuardRulesInput,
  contractId: SorobanContractId = DEFAULT_YIELD_GUARD_CONTRACT_ID,
): Promise<BuiltContractTx> {
  const protocolsScVal = xdr.ScVal.scvVec(
    input.allowedProtocols.map((addr) => Address.fromString(addr).toScVal()),
  );
  return buildAndTryPrepareContractTx({
    owner: input.owner,
    contractId,
    method: 'update_rules',
    args: [
      Address.fromString(input.owner).toScVal(),
      Address.fromString(input.agentSigner).toScVal(),
      nativeToScVal(BigInt(input.maxSingleTxAmount), { type: 'i128' }),
      nativeToScVal(BigInt(input.dailySpendLimit), { type: 'i128' }),
      nativeToScVal(input.minHealthFactorBps, { type: 'u32' }),
      protocolsScVal,
    ],
  });
}

export async function submitSignedXdrToTestnet(
  signedXdr: string,
  rpcUrl: string = TESTNET_SOROBAN_RPC_URL,
): Promise<{ readonly hash: string; readonly status: string }> {
  const server = new rpc.Server(rpcUrl);
  const tx = TransactionBuilder.fromXDR(signedXdr, TESTNET_NETWORK_PASSPHRASE);
  const response = await server.sendTransaction(tx);
  return {
    hash: response.hash,
    status: response.status,
  };
}
