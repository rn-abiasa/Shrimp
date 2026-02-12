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
  DialogTrigger,
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
  }, [tokens]);

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
    // dy = (y * dx) / (x + dx)
    const dx = BigInt(Math.floor(input * 1e8)); // convert to base units
    if (dx === 0n) return "";

    const dy = (reserveOut * dx) / (reserveIn + dx);

    // apply 0.3% fee
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

  const handleSwap = async () => {
    if (!isConnected || !activePool || !payAmount) return;
    setIsSwapping(true);
    try {
      const amount = BigInt(Math.floor(parseFloat(payAmount) * 1e8));

      const txData = {
        function: "swap",
        args: [amount.toString()],
      };

      const tx = await wallet.createTransaction({
        recipient: activePool.address,
        amount: amount,
        type: "CALL_CONTRACT",
        data: txData,
        chain: [], // Not needed for discovery but required by API
      });

      const result = await dexApi.transact(tx);
      if (result.type === "error") throw new Error(result.message);

      await dexApi.mine();

      alert("Swap successful!");
      setPayAmount("");
      setReceiveAmount("");
    } catch (err) {
      console.error(err);
      alert(`Swap failed: ${err.message}`);
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

  if (tokensLoading || poolsLoading)
    return (
      <Card className="w-full max-w-[480px] bg-background/60 backdrop-blur-xl border-slate-800 p-12 text-center animate-pulse flex flex-col items-center gap-4">
        <RefreshCw className="h-8 w-8 text-pink-500 animate-spin" />
        <span className="font-bold text-slate-400">Syncing with Chain...</span>
      </Card>
    );

  const hasLiquidity = !!activePool;

  // Get dynamic balance
  let availableBalance = 0n;
  if (fromToken?.address === "native") {
    availableBalance = BigInt(balance || 0);
  } else if (addressData?.tokens) {
    const token = addressData.tokens.find(
      (t) => t.contractAddress === fromToken?.address,
    );
    if (token) availableBalance = BigInt(token.balance);
  }

  return (
    <>
      <Card className="w-full max-w-[480px] bg-background/60 backdrop-blur-xl border-slate-800 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-xl font-bold">Swap</CardTitle>
          <Button variant="ghost" size="icon" className="hover:bg-slate-800">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground px-1">
              <span>You pay</span>
              {isConnected && (
                <span className="text-[10px] uppercase font-bold tracking-wider">
                  Balance: {(Number(availableBalance) / 1e8).toLocaleString()}{" "}
                  {fromToken?.symbol}
                </span>
              )}
            </div>
            <div className="relative group">
              <div className="relative flex items-center bg-slate-900/50 border border-slate-800 rounded-xl p-3 focus-within:border-pink-500/50 transition-all">
                <Input
                  className="border-0 bg-transparent text-2xl font-bold focus-visible:ring-0 p-0"
                  placeholder="0.0"
                  value={payAmount}
                  onChange={(e) => handlePayChange(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => setSelectingType("from")}
                  className="ml-2 bg-slate-800 border-slate-700 hover:bg-slate-700 rounded-lg gap-2"
                >
                  <span>{fromToken?.icon}</span>
                  <span className="font-bold">{fromToken?.symbol}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-6 relative z-10">
            <Button
              size="icon"
              onClick={switchTokens}
              className="rounded-full bg-slate-900 border-4 border-slate-950 hover:bg-pink-500 transition-colors text-white h-10 w-10 shadow-xl"
            >
              <ArrowDown className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground px-1">
              <span>You receive</span>
            </div>
            <div className="relative group">
              <div className="relative flex items-center bg-slate-900/50 border border-slate-800 rounded-xl p-3 focus-within:border-pink-500/50 transition-all">
                <Input
                  className="border-0 bg-transparent text-2xl font-bold focus-visible:ring-0 p-0 text-slate-400"
                  placeholder="0.0"
                  value={receiveAmount}
                  readOnly
                />
                <Button
                  variant="outline"
                  onClick={() => setSelectingType("to")}
                  className="ml-2 bg-slate-800 border-slate-700 hover:bg-slate-700 rounded-lg gap-2"
                >
                  <span>{toToken?.icon}</span>
                  <span className="font-bold">{toToken?.symbol}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </div>
            </div>
          </div>

          {!isConnected && (
            <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-4 text-[11px] text-pink-500 flex items-center gap-3">
              <Wallet className="h-5 w-5 shrink-0" />
              <span>
                Connect your web wallet to start trading on ShrimpChain.
              </span>
            </div>
          )}

          {isConnected && !hasLiquidity && fromToken && toToken && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-[11px] text-orange-500 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>
                This pair has no liquidity pool. Add liquidity to trade.
              </span>
            </div>
          )}

          {hasLiquidity && payAmount && !isNaN(parseFloat(payAmount)) && (
            <div className="bg-slate-900/30 rounded-xl p-4 space-y-2 text-[11px] text-muted-foreground border border-slate-800/50">
              <div className="flex justify-between">
                <span>Rate</span>
                <span className="text-white font-mono">
                  1 {fromToken?.symbol} ={" "}
                  {(parseFloat(receiveAmount) / parseFloat(payAmount)).toFixed(
                    6,
                  )}{" "}
                  {toToken?.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  Protocol Fee <Info className="h-3 w-3" />
                </span>
                <span className="text-pink-500 font-bold uppercase tracking-tighter">
                  0.3% (Liquidity Provider Fee)
                </span>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSwap}
            disabled={!isConnected || !hasLiquidity || !payAmount || isSwapping}
            className="w-full h-14 text-lg font-bold bg-pink-500 hover:bg-pink-600 shadow-lg shadow-pink-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
          >
            {isSwapping ? (
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            ) : null}
            {!isConnected
              ? "Connect Wallet"
              : isSwapping
                ? "Processing..."
                : hasLiquidity
                  ? "Swap Tokens"
                  : "No Liquidity"}
          </Button>
        </CardFooter>
      </Card>

      <Dialog
        open={!!selectingType}
        onOpenChange={(open) => !open && setSelectingType(null)}
      >
        <DialogContent className="max-w-md bg-slate-950 border-slate-800 p-0 overflow-hidden flex flex-col h-[500px]">
          <DialogHeader className="p-6 border-b border-slate-900">
            <DialogTitle>Select a token</DialogTitle>
          </DialogHeader>
          <div className="p-4 border-b border-slate-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search name or address"
                className="pl-9 bg-slate-900 border-slate-800 focus-visible:ring-pink-500/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredTokens.map((token) => (
              <button
                key={token.address}
                onClick={() => handleSelectToken(token)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-900 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                    {token.icon}
                  </div>
                  <div>
                    <div className="font-bold">{token.symbol}</div>
                    <div className="text-xs text-slate-500">{token.name}</div>
                  </div>
                </div>
                {token.address ===
                  (selectingType === "from"
                    ? fromToken?.address
                    : toToken?.address) && (
                  <div className="text-pink-500 font-bold text-xs uppercase italic">
                    Selected
                  </div>
                )}
              </button>
            ))}
            {filteredTokens.length === 0 && (
              <div className="py-12 text-center text-slate-600 italic text-sm">
                No tokens found
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
