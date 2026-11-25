'use client';

import * as React from 'react';
import {
  KitEventType,
  Networks,
  StellarWalletsKit,
} from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { ChevronDown, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type {
  StellarAccountAddress,
  StellarNetwork,
} from '../../../../packages/agent-core/src/types';
import { TESTNET_NETWORK_PASSPHRASE } from '../lib/stellar';
import { truncateAddress } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export const PREVIEW_TESTNET_ADDRESS: StellarAccountAddress =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export type WalletMode = 'extension' | 'preview' | null;

export interface WalletContextValue {
  readonly address: StellarAccountAddress | null;
  readonly walletMode: WalletMode;
  readonly walletName: string | null;
  readonly network: StellarNetwork;
  readonly isConnecting: boolean;
  readonly connectWithKit: () => Promise<void>;
  readonly connectPreviewAccount: () => void;
  readonly disconnect: () => Promise<void>;
  readonly signTransaction: (
    unsignedXdr: string,
    networkPassphrase?: string,
  ) => Promise<{ readonly signedTxXdr: string; readonly simulatedPreview: boolean }>;
}

const WalletContext = React.createContext<WalletContextValue | null>(null);

let swkInitialized = false;

function ensureKitInitialized(): void {
  if (typeof window === 'undefined' || swkInitialized) {
    return;
  }
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [new FreighterModule(), new xBullModule()],
  });
  swkInitialized = true;
}

export function WalletProvider({ children }: { readonly children: React.ReactNode }) {
  const [address, setAddress] = React.useState<StellarAccountAddress | null>(
    PREVIEW_TESTNET_ADDRESS,
  );
  const [walletMode, setWalletMode] = React.useState<WalletMode>('preview');
  const [walletName, setWalletName] = React.useState<string | null>('Testnet Preview');
  const [isConnecting, setIsConnecting] = React.useState(false);

  React.useEffect(() => {
    ensureKitInitialized();

    const unsubState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
      if (event.payload.address) {
        setAddress(event.payload.address);
        setWalletMode('extension');
        setWalletName(StellarWalletsKit.selectedModule?.productName ?? 'Stellar Wallet');
      }
    });

    const unsubDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      setAddress(null);
      setWalletMode(null);
      setWalletName(null);
    });

    return () => {
      unsubState();
      unsubDisconnect();
    };
  }, []);

  const connectWithKit = React.useCallback(async () => {
    ensureKitInitialized();
    setIsConnecting(true);
    try {
      const { address: connectedAddress } = await StellarWalletsKit.authModal();
      setAddress(connectedAddress);
      setWalletMode('extension');
      const moduleName = StellarWalletsKit.selectedModule?.productName ?? 'Stellar Wallet';
      setWalletName(moduleName);
      toast.success(`Connected ${moduleName} on Stellar Testnet`, {
        description: truncateAddress(connectedAddress, 8, 6),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wallet connection canceled';
      toast.error('Wallet connection did not complete', {
        description: msg,
      });
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectPreviewAccount = React.useCallback(() => {
    setAddress(PREVIEW_TESTNET_ADDRESS);
    setWalletMode('preview');
    setWalletName('Testnet Preview');
    toast.info('Connected read-only Testnet Preview account', {
      description: 'Connect Freighter or xBull anytime for live Testnet signing.',
    });
  }, []);

  const disconnect = React.useCallback(async () => {
    if (walletMode === 'extension') {
      try {
        await StellarWalletsKit.disconnect();
      } catch {
        // Ignore kit disconnect errors when extension is closed
      }
    }
    setAddress(null);
    setWalletMode(null);
    setWalletName(null);
    toast.info('Wallet disconnected');
  }, [walletMode]);

  const signTransaction = React.useCallback(
    async (
      unsignedXdr: string,
      networkPassphrase: string = TESTNET_NETWORK_PASSPHRASE,
    ): Promise<{ readonly signedTxXdr: string; readonly simulatedPreview: boolean }> => {
      if (!address) {
        throw new Error('Connect a Stellar Testnet wallet before signing.');
      }

      if (walletMode === 'extension') {
        const { signedTxXdr } = await StellarWalletsKit.signTransaction(unsignedXdr, {
          networkPassphrase,
          address,
        });
        return { signedTxXdr, simulatedPreview: false };
      }

      // Non-custodial preview fallback: never holds private keys; returns the verified unsigned XDR
      // marked as preview so the user clearly sees Freighter/xBull is needed for live broadcast.
      return { signedTxXdr: unsignedXdr, simulatedPreview: true };
    },
    [address, walletMode],
  );

  const value = React.useMemo<WalletContextValue>(
    () => ({
      address,
      walletMode,
      walletName,
      network: 'TESTNET',
      isConnecting,
      connectWithKit,
      connectPreviewAccount,
      disconnect,
      signTransaction,
    }),
    [
      address,
      walletMode,
      walletName,
      isConnecting,
      connectWithKit,
      connectPreviewAccount,
      disconnect,
      signTransaction,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used inside <WalletProvider>');
  }
  return ctx;
}

export function WalletConnectionControl() {
  const {
    address,
    walletMode,
    walletName,
    isConnecting,
    connectWithKit,
    connectPreviewAccount,
    disconnect,
  } = useWallet();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

  if (!address) {
    return (
      <div className="relative" ref={menuRef}>
        <Button
          variant="default"
          size="sm"
          onClick={() => setMenuOpen((prev) => !prev)}
          disabled={isConnecting}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Wallet className="size-4" />
          <span>{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </Button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-40 w-72 rounded-[14px] border border-border bg-popover p-2 text-popover-foreground"
          >
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              Select Stellar Testnet signer
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void connectWithKit();
              }}
              className="flex min-h-11 w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <div>
                <div className="font-medium">Freighter / xBull</div>
                <div className="text-xs text-muted-foreground">
                  Stellar Wallets Kit · Testnet
                </div>
              </div>
              <Badge variant="safe">Live</Badge>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                connectPreviewAccount();
              }}
              className="mt-1 flex min-h-11 w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <div>
                <div className="font-medium">Testnet Preview Account</div>
                <div className="text-xs text-muted-foreground">
                  Simulate without browser extension
                </div>
              </div>
              <Badge variant="outline">Sandbox</Badge>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="min-h-9 h-9 gap-1.5 bg-card px-2.5 sm:min-h-10 sm:gap-2 sm:px-3.5"
      >
        <ShieldCheck
          className={
            walletMode === 'extension'
              ? 'size-4 text-risk-safe'
              : 'size-4 text-muted-foreground'
          }
        />
        <span className="tabular-financial text-xs text-foreground">
          {truncateAddress(address, 4, 4)}
        </span>
        <span className="hidden sm:inline text-xs text-muted-foreground">· Testnet</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-72 rounded-[14px] border border-border bg-popover p-2 text-popover-foreground"
        >
          <div className="rounded-[8px] bg-surface-inset px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">{walletName}</span>
              <Badge variant={walletMode === 'extension' ? 'safe' : 'outline'}>
                {walletMode === 'extension' ? 'Testnet Live' : 'Testnet Preview'}
              </Badge>
            </div>
            <div className="mt-1.5 break-all tabular-financial text-[11px] text-muted-foreground">
              {address}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-1">
            {walletMode !== 'extension' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void connectWithKit();
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-[8px] px-3 text-left text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <Wallet className="size-3.5 text-risk-safe" />
                <span>Connect Freighter / xBull</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-[8px] px-3 text-left text-xs font-medium text-risk-danger transition-colors duration-150 hover:bg-risk-danger-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>Disconnect Wallet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
