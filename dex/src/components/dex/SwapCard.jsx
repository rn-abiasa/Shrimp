import { useState, useEffect, useMemo } from "react";
import {
  ArrowDown,
  Settings,
  Info,
  AlertCircle,
  Wallet,
  RefreshCw,
  Search,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTokens, usePools, useAddress } from "@/hooks/useData";
import { useWebWallet } from "@/hooks/useWebWallet";
import { dexApi } from "@/lib/api";

export default function SwapCard() {
  const { data: tokens, isLoading: tokensLoading } = useTokens();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { isConnected, balance, address, wallet } = useWebWallet();
  const { data: addressData } = useAddress(address);

  const [payAmount, setPayAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [activePool, setActivePool] = useState(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const [selectingType, setSelectingType] = useState(null); // 'from' | 'to'
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize tokens
  useEffect(() => {
    if (tokens && tokens.length > 0 && !fromToken) {
      setFromToken(tokens[0]); // Native SHRIMP
      if (tokens.length > 1) setToToken(tokens[1]);
    }
  }, [tokens, fromToken]);

  // Find pool for selected pair
  useEffect(() => {
    if (pools && fromToken && toToken) {
      const pool = pools.find(
        (p) =>
          (p.tokenAddress?.toLowerCase() === fromToken.address?.toLowerCase() &&
            toToken.address === "native") ||
          (p.tokenAddress?.toLowerCase() === toToken.address?.toLowerCase() &&
            fromToken.address === "native"),
      );
      setActivePool(pool);
    }
  }, [pools, fromToken, toToken]);

  const calculateReceive = (val, poolOverride = null) => {
    const pool = poolOverride || activePool;
    if (!val || isNaN(val) || !pool) return "";

    const input = parseFloat(val);
    const isShrimpIn = fromToken.address === "native";

    const reserveIn = isShrimpIn ? pool.shrimpReserve : pool.tokenReserve;
    const reserveOut = isShrimpIn ? pool.tokenReserve : pool.shrimpReserve;

    if (reserveIn === 0n) return "0";

    // x * y = k logic
    const dx = BigInt(Math.floor(input * 1e8));
    if (dx === 0n) return "";

    const dy = (reserveOut * dx) / (reserveIn + dx);
    const dyWithFee = (dy * 997n) / 1000n;

    return (Number(dyWithFee) / 1e8).toFixed(6);
  };

  const handlePayChange = (val) => {
    setPayAmount(val);
    setReceiveAmount(calculateReceive(val));
  };

  const switchTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setPayAmount(receiveAmount);
    setReceiveAmount(calculateReceive(receiveAmount));
  };

  const handleSelectToken = (token) => {
    if (selectingType === "from") {
      if (token.address === toToken?.address) {
        switchTokens();
      } else {
        setFromToken(token);
        setReceiveAmount(calculateReceive(payAmount));
      }
    } else {
      if (token.address === fromToken?.address) {
        switchTokens();
      } else {
        setToToken(token);
        setReceiveAmount(calculateReceive(payAmount));
      }
    }
    setSelectingType(null);
    setSearchQuery("");
  };

  const waitForConfirmation = async (txHash) => {
    let confirmed = false;
    let attempts = 0;
    while (!confirmed && attempts < 15) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const detail = await dexApi.get(`/api/explorer/transaction/${txHash}`);
        if (detail && detail.status === "confirmed") {
          confirmed = true;
        }
      } catch (e) {
        console.warn("Polling confirmation error:", e);
      }
      attempts++;
    }
    return confirmed;
  };

  const handleSwap = async () => {
    if (!isConnected || !activePool || !payAmount) return;

    const isShrimpIn = fromToken?.address === "native";
    setIsSwapping(true);
    try {
      const parsed = parseFloat(payAmount);
      const amountBase = BigInt(Math.floor(parsed * 1e8));

      if (isShrimpIn) {
        const tx = await wallet.createTransaction({
          recipient: activePool.address,
          amount: amountBase,
          type: "CALL_CONTRACT",
          data: { function: "swap", args: [amountBase.toString()] },
        });

        const txRes = await dexApi.transact(tx);
        await waitForConfirmation(txRes.transaction.id);
      } else {
        // Token -> SHRIMP (2-Step)
        const transferTxData = await wallet.createTransaction({
          recipient: fromToken.address,
          amount: 0n,
          type: "CALL_CONTRACT",
          data: {
            function: "transfer",
            args: [activePool.address, amountBase.toString()],
          },
        });

        const transferTx = await dexApi.transact(transferTxData);
        await waitForConfirmation(transferTx.transaction.id);

        const sellTxData = await wallet.createTransaction({
          recipient: activePool.address,
          amount: 0n,
          type: "CALL_CONTRACT",
          data: { function: "sell", args: [] },
        });

        const sellTx = await dexApi.transact(sellTxData);
        await waitForConfirmation(sellTx.transaction.id);
      }

      setPayAmount("");
      setReceiveAmount("");
    } catch (err) {
      console.error("Swap error:", err);
    } finally {
      setIsSwapping(false);
    }
  };

  const filteredTokens = useMemo(() => {
    if (!tokens) return [];
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.address.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [tokens, searchQuery]);

  if (tokensLoading || poolsLoading) {
    return (
      <Card className="w-full bg-background border-border p-12 text-center flex flex-col items-center gap-4">
        <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
        <span className="text-sm text-muted-foreground font-medium">
          Loading Liquidity...
        </span>
      </Card>
    );
  }

  const hasLiquidity = !!activePool;
  let availableBalance = 0n;
  if (fromToken?.address === "native") {
    availableBalance = BigInt(balance || 0);
  } else if (addressData?.tokens) {
    const token = addressData.tokens.find(
      (t) => t.contractAddress === fromToken?.address,
    );
    if (token) availableBalance = BigInt(token.balance || 0);
  }

  return (
    <>
      <Card className="w-full border-border bg-card shadow-sm rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between px-6 py-5">
          <CardTitle className="text-lg font-bold">Swap</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>
        </CardHeader>
        <CardContent className="px-6 space-y-1">
          {/* Pay Section */}
          <div className="bg-muted/40 rounded-2xl p-4 space-y-2 border border-transparent focus-within:border-border transition-all">
            <div className="flex justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-tight">
              <span>You pay</span>
              {isConnected && (
                <span>
                  Balance: {(Number(availableBalance) / 1e8).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="border-0 bg-transparent text-3xl font-bold focus-visible:ring-0 p-0 h-auto"
                placeholder="0"
                value={payAmount}
                onChange={(e) => handlePayChange(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => setSelectingType("from")}
                className="h-10 rounded-xl px-3 bg-background border-border hover:bg-muted gap-2 shrink-0 font-bold"
              >
                <div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs">
                  {fromToken?.icon}
                </div>
                <span>{fromToken?.symbol}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </div>
          </div>

          {/* Switch Button */}
          <div className="flex justify-center -my-3.5 relative z-10">
            <Button
              size="icon"
              onClick={switchTokens}
              className="rounded-xl bg-background border border-border hover:bg-muted text-foreground h-9 w-9 shadow-sm"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Receive Section */}
          <div className="bg-muted/40 rounded-2xl p-4 space-y-2 border border-transparent focus-within:border-border transition-all">
            <div className="flex justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-tight">
              <span>You receive</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="border-0 bg-transparent text-3xl font-bold focus-visible:ring-0 p-0 h-auto opacity-70"
                placeholder="0"
                value={receiveAmount}
                readOnly
              />
              <Button
                variant="outline"
                onClick={() => setSelectingType("to")}
                className="h-10 rounded-xl px-3 bg-background border-border hover:bg-muted gap-2 shrink-0 font-bold"
              >
                <div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs">
                  {toToken?.icon}
                </div>
                <span>{toToken?.symbol}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            {!isConnected && (
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-[11px] text-blue-500 flex items-center gap-3">
                <Wallet className="h-4 w-4 shrink-0" />
                <span>Connect your wallet to trade tokens instantly.</span>
              </div>
            )}

            {isConnected && !hasLiquidity && fromToken && toToken && (
              <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-3 text-[11px] text-orange-500 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No liquidity pool found for this pair.</span>
              </div>
            )}

            {hasLiquidity && payAmount && !isNaN(parseFloat(payAmount)) && (
              <div className="px-1 space-y-1.5 text-[11px] text-muted-foreground font-medium">
                <div className="flex justify-between">
                  <span>Exchange Rate</span>
                  <span className="text-foreground font-mono">
                    1 {fromToken?.symbol} ={" "}
                    {(
                      parseFloat(receiveAmount) / parseFloat(payAmount)
                    ).toFixed(6)}{" "}
                    {toToken?.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    Fee (0.3%) <Info className="h-3 w-3" />
                  </span>
                  <span className="text-foreground font-mono">
                    {(parseFloat(payAmount) * 0.003).toFixed(6)}{" "}
                    {fromToken?.symbol}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="px-6 py-5">
          <Button
            size="lg"
            onClick={handleSwap}
            disabled={
              !isConnected ||
              !hasLiquidity ||
              !payAmount ||
              isSwapping ||
              parseFloat(payAmount) <= 0
            }
            className="w-full h-14 text-base font-bold rounded-2xl transition-all shadow-none"
          >
            {isSwapping ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {!isConnected
              ? "Connect Wallet"
              : isSwapping
                ? "Swapping..."
                : !payAmount || parseFloat(payAmount) <= 0
                  ? "Enter Amount"
                  : hasLiquidity
                    ? "Swap"
                    : "Insufficient Liquidity"}
          </Button>
        </CardFooter>
      </Card>

      <Dialog
        open={!!selectingType}
        onOpenChange={(open) => !open && setSelectingType(null)}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden border-border bg-card rounded-3xl h-[500px] flex flex-col">
          <DialogHeader className="p-6 border-b">
            <DialogTitle>Select a token</DialogTitle>
          </DialogHeader>
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or address"
                className="pl-9 bg-muted border-none focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredTokens.map((token) => (
              <button
                key={token.address}
                onClick={() => handleSelectToken(token)}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-muted transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center text-xl">
                    {token.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{token.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {token.name}
                    </span>
                  </div>
                </div>
                {token.address ===
                  (selectingType === "from"
                    ? fromToken?.address
                    : toToken?.address) && (
                  <div className="text-[10px] font-bold uppercase text-primary">
                    Selected
                  </div>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
