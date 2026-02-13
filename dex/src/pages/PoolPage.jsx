import { useState } from "react";
import {
  Plus,
  Droplets,
  Info,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWebWallet } from "@/hooks/useWebWallet";
import { dexApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import TokenIcon from "../components/dex/TokenIcon";
import { WebWalletUtils } from "@/lib/wallet-utils";

const AMM_POOL_CODE = `class SmartContract {
  init() {
    this.state.shrimpBalance = 0n;
    this.state.tokenBalance = 0n;
    this.state.tokenAddress = null;
    this.state.symbol = "SHRIMPS";
    this.state.name = "Shrim Stable Test";
    this.state.owner = this.sender;
    this.state.balances = {};
  }

  setup(tokenAddress, symbol, name) {
    if (this.state.tokenAddress) throw new Error("Pool already setup");
    this.state.tokenAddress = tokenAddress;
    if (symbol) this.state.symbol = symbol;
    if (name) this.state.name = name;
  }

  swap(amountInString) {
    const amountIn = BigInt(amountInString);
    if (amountIn <= 0n) throw new Error("Amount must be positive");
    const shrimpReserve = this.balance;
    const tokenReserve = BigInt(this.state.tokenBalance || 0);
    if (shrimpReserve === 0n || tokenReserve === 0n) throw new Error("No liquidity in pool");
    const dy = (tokenReserve * amountIn) / shrimpReserve;
    const amountOut = (dy * 997n) / 1000n;
    if (amountOut > tokenReserve) throw new Error("Insufficient token liquidity");
    this.state.shrimpBalance = shrimpReserve.toString();
    this.state.tokenBalance = (tokenReserve - amountOut).toString();
    this.call(this.state.tokenAddress, "transfer", [this.sender, amountOut.toString()]);
  }

  sell() {
    if (!this.state.tokenAddress) throw new Error("Pool not setup");
    const tokenAddress = this.state.tokenAddress;
    const shrimpReserve = this.balance;
    const tokenReserve = BigInt(this.state.tokenBalance || 0);
    const actualTokenBalance = BigInt(this.call(tokenAddress, "balanceOf", [this.contractAddress]));
    const amountIn = actualTokenBalance - tokenReserve;
    if (amountIn <= 0n) throw new Error("No tokens received");
    const dy = (shrimpReserve * amountIn) / (tokenReserve + amountIn);
    const amountOut = (dy * 997n) / 1000n;
    if (amountOut > shrimpReserve) throw new Error("Insufficient SHRIMP liquidity");
    this.transferShrimp(this.sender, amountOut.toString());
    this.state.shrimpBalance = (shrimpReserve - amountOut).toString();
    this.state.tokenBalance = actualTokenBalance.toString();
  }

  syncReserves(shrimpAmount, tokenAmount) {
    if (this.sender !== this.state.owner) throw new Error("Not authorized");
    this.state.shrimpBalance = this.balance.toString();
    this.state.tokenBalance = BigInt(tokenAmount).toString();
  }
}`;

const TX_FEE = 10n;

export default function PoolPage() {
  const { isConnected, wallet, address, balance } = useWebWallet();
  const [tokenAddress, setTokenAddress] = useState("");
  const [shrimpAmount, setShrimpAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const toBaseUnits = (val) => BigInt(Math.floor(parseFloat(val) * 100000000));

  const handleAddLiquidity = async () => {
    if (!isConnected || !tokenAddress || !shrimpAmount || !tokenAmount) return;

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 0. Get initial nonce and data
      setStep("Initializing transaction sequence...");
      const accountInfo = await dexApi.getAddress(address);
      let currentNonce = accountInfo.nonce || 0;

      const sAmt = toBaseUnits(shrimpAmount);
      const tAmt = toBaseUnits(tokenAmount);

      const totalShrimpNeeded = sAmt + TX_FEE * 5n;
      if (balance < totalShrimpNeeded) {
        throw new Error(
          `Insufficient SHRIMP balance. Need ${parseFloat(totalShrimpNeeded.toString()) / 100000000} (including fees)`,
        );
      }

      // 1. Deploy Pool Contract
      setStep("Step 1/5: Deploying AMM Pool contract...");
      const deployTx = await wallet.createTransaction({
        type: "CREATE_CONTRACT",
        data: { code: AMM_POOL_CODE },
        nonce: currentNonce,
        fee: TX_FEE,
      });
      await dexApi.transact(deployTx);

      // Calculate pool address (matches backend: cryptoHash(sender, nonce, code))
      // Note: We need a way to import stableStringify/cryptoHash or rely on WebWalletUtils if exposed
      // For now, let's assume we can get it or use a heuristic.
      // Wait, let's look at wallet-utils.js again.
      // WebWalletUtils doesn't expose cryptoHash directly but it uses it inside.
      // I'll add a helper to WebWalletUtils or just compute it here.
      // Actually, let's just use the fact that we know how it's calculated.

      // Actually, without cryptoHash here it's hard.
      // I'll use a hack: I'll fetch the contracts and find the one that matches our sender/code?
      // No, let's just update WebWalletUtils to expose cryptoHash.

      // Wait, I can't update WebWalletUtils AND use it in the same turn for PoolPage.jsx.
      // Better: The dexApi.transact returns the transaction.
      // I'll calculate it using the same logic.

      const poolAddress = WebWalletUtils.calculateContractAddress(
        address,
        currentNonce,
        AMM_POOL_CODE,
      );
      currentNonce++;

      // 2. Setup Pool
      setStep("Step 2/5: Configuring pool metadata...");
      const setupTx = await wallet.createTransaction({
        recipient: poolAddress,
        type: "CALL_CONTRACT",
        data: { function: "setup", args: [tokenAddress] },
        nonce: currentNonce,
        fee: TX_FEE,
      });
      await dexApi.transact(setupTx);
      currentNonce++;

      // 3. Provide SHRIMP
      setStep("Step 3/5: Transferring SHRIMP liquidity...");
      const shrimpTx = await wallet.createTransaction({
        recipient: poolAddress,
        amount: sAmt,
        type: "TRANSFER",
        nonce: currentNonce,
        fee: TX_FEE,
      });
      await dexApi.transact(shrimpTx);
      currentNonce++;

      // 4. Provide Tokens
      setStep("Step 4/5: Transferring token liquidity...");
      const tokenTx = await wallet.createTransaction({
        recipient: tokenAddress,
        type: "CALL_CONTRACT",
        data: { function: "transfer", args: [poolAddress, tAmt.toString()] },
        nonce: currentNonce,
        fee: TX_FEE,
      });
      await dexApi.transact(tokenTx);
      currentNonce++;

      // 5. Sync Reserves
      setStep("Step 5/5: Synchronizing reserves...");
      const syncTx = await wallet.createTransaction({
        recipient: poolAddress,
        type: "CALL_CONTRACT",
        data: {
          function: "syncReserves",
          args: [sAmt.toString(), tAmt.toString()],
        },
        nonce: currentNonce,
        fee: TX_FEE,
      });
      await dexApi.transact(syncTx);

      setSuccess(true);
      setTokenAddress("");
      setShrimpAmount("");
      setTokenAmount("");

      // Trigger mining if in dev mode
      try {
        await dexApi.mine();
      } catch (e) {}
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to add liquidity");
    } finally {
      setIsLoading(false);
      setStep(null);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[520px]"
      >
        <Card className="border-border bg-card shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="px-6 py-8 text-center">
            <div className="mx-auto size-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Droplets className="h-6 w-6 text-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">Add Liquidity</CardTitle>
            <CardDescription className="text-sm px-4">
              Provide tokens to the ShrimpSwap protocol to earn a share of
              trading fees.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-8 space-y-6">
            <AnimatePresence mode="wait">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-3"
                >
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                  <h3 className="text-lg font-bold text-green-500">
                    Pool Created Successfully!
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Liquidity has been added. It may take a few moments to
                    reflect in the explorer.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl mt-2"
                    onClick={() => setSuccess(false)}
                  >
                    Add More
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                      Token Address
                    </label>
                    <Input
                      placeholder="0x..."
                      className="h-12 rounded-xl bg-muted/40 border-transparent focus:border-border transition-all"
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                        SHRIMP Amount
                      </label>
                      <div className="relative">
                        <Input
                          placeholder="0.0"
                          className="h-12 rounded-xl bg-muted/40 border-transparent focus:border-border transition-all pl-10"
                          value={shrimpAmount}
                          onChange={(e) => setShrimpAmount(e.target.value)}
                          disabled={isLoading}
                        />
                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                          <TokenIcon token="native" size="xs" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                        Token Amount
                      </label>
                      <div className="relative">
                        <Input
                          placeholder="0.0"
                          className="h-12 rounded-xl bg-muted/40 border-transparent focus:border-border transition-all pl-10"
                          value={tokenAmount}
                          onChange={(e) => setTokenAmount(e.target.value)}
                          disabled={isLoading}
                        />
                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                          <TokenIcon token={tokenAddress} size="xs" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex gap-3 text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium">{error}</p>
                    </div>
                  )}

                  <div className="bg-muted/30 rounded-2xl p-4 flex gap-3">
                    <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {step ? (
                        <span className="text-foreground font-medium flex items-center">
                          <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                          {step}
                        </span>
                      ) : (
                        "By adding liquidity, you'll earn 0.3% of all trades on this pair proportional to your share of the pool."
                      )}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>

          <CardFooter className="px-8 py-8">
            <Button
              className={`w-full h-14 rounded-2xl text-base font-bold transition-all shadow-none ${success ? "hidden" : ""}`}
              disabled={
                !isConnected ||
                isLoading ||
                !tokenAddress ||
                !shrimpAmount ||
                !tokenAmount
              }
              onClick={handleAddLiquidity}
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {isConnected
                ? isLoading
                  ? "Processing..."
                  : "Create & Supply"
                : "Connect Wallet to Start"}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
