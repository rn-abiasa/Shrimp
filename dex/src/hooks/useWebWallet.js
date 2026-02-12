import { useState, useEffect, useCallback } from "react";
import { WebWalletUtils } from "../lib/wallet-utils";
import { dexApi } from "../lib/api";

const WALLET_STORAGE_KEY = "shrimp_dex_wallet_mnemonic";

export function useWebWallet() {
  const [wallet, setWallet] = useState(null); // { address, publicKey, mnemonic, keyPair }
  const [balance, setBalance] = useState(0n);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load from localStorage
  useEffect(() => {
    const storedMnemonic = localStorage.getItem(WALLET_STORAGE_KEY);
    if (storedMnemonic && WebWalletUtils.validateMnemonic(storedMnemonic)) {
      try {
        const derived = WebWalletUtils.deriveKeyPair(storedMnemonic);
        setWallet(derived);
      } catch (e) {
        console.error("Failed to recover wallet from storage", e);
      }
    }
    setIsLoading(false);
  }, []);

  // Fetch balance periodically
  useEffect(() => {
    if (!wallet?.address) return;

    const fetchBalance = async () => {
      try {
        const data = await dexApi.getAddress(wallet.address);
        setBalance(BigInt(data.balance || 0));
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [wallet?.address]);

  const createWallet = useCallback(() => {
    const mnemonic = WebWalletUtils.generateMnemonic();
    const derived = WebWalletUtils.deriveKeyPair(mnemonic);
    localStorage.setItem(WALLET_STORAGE_KEY, mnemonic);
    setWallet(derived);
    return mnemonic;
  }, []);

  const importWallet = useCallback((mnemonic) => {
    if (!WebWalletUtils.validateMnemonic(mnemonic))
      throw new Error("Invalid mnemonic");
    const derived = WebWalletUtils.deriveKeyPair(mnemonic);
    localStorage.setItem(WALLET_STORAGE_KEY, mnemonic);
    setWallet(derived);
  }, []);

  const disconnectWallet = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    setWallet(null);
    setBalance(0n);
  }, []);

  const createTransaction = useCallback(
    async ({ recipient, amount, type, data, fee = 0n }) => {
      if (!wallet) throw new Error("Wallet not connected");

      // 1. Fetch current nonce from node
      const accountData = await dexApi.getAddress(wallet.address);
      const nonce = accountData.nonce || 0;

      // 2. Build and sign transaction
      const tx = WebWalletUtils.createTransactionData({
        senderAddress: wallet.address,
        recipient,
        amount,
        fee,
        nonce,
        type,
        data,
        keyPair: wallet.keyPair,
      });

      return tx;
    },
    [wallet],
  );

  return {
    wallet: {
      ...wallet,
      createTransaction, // Add it to the wallet object for compatibility with SwapCard
    },
    address: wallet?.address,
    publicKey: wallet?.publicKey,
    mnemonic: wallet?.mnemonic,
    balance,
    isLoading,
    createWallet,
    importWallet,
    disconnectWallet,
    createTransaction, // Also expose at top level
    isConnected: !!wallet,
  };
}
