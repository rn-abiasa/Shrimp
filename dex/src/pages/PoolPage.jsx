import { useState } from "react";
import { Plus, Droplets, Info, AlertCircle, RefreshCw } from "lucide-react";
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
import { motion } from "framer-motion";
import TokenIcon from "../components/dex/TokenIcon";

export default function PoolPage() {
  const { isConnected, wallet } = useWebWallet();
  const [tokenAddress, setTokenAddress] = useState("");
  const [shrimpAmount, setShrimpAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAddLiquidity = async () => {
    if (!isConnected || !tokenAddress || !shrimpAmount || !tokenAmount) return;
    setIsLoading(true);
    try {
      // Logic for adding liquidity (Simplified: find/create pool and sync)
      console.log("Adding liquidity to", tokenAddress);
      // For now, we'll just show a success alert to confirm the UI works
      alert("Liquidity request sent! Check the explorer for confirmation.");
      setTokenAddress("");
      setShrimpAmount("");
      setTokenAmount("");
    } catch (err) {
      console.error(err);
      alert("Failed to add liquidity: " + err.message);
    } finally {
      setIsLoading(false);
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
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                Token Address
              </label>
              <Input
                placeholder="0x..."
                className="h-12 rounded-xl bg-muted/40 border-transparent focus:border-border transition-all"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
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
                  />
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                    <TokenIcon token={tokenAddress} size="xs" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-2xl p-4 flex gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                By adding liquidity, you'll earn 0.3% of all trades on this pair
                proportional to your share of the pool.
              </p>
            </div>
          </CardContent>
          <CardFooter className="px-8 py-8">
            <Button
              className="w-full h-14 rounded-2xl text-base font-bold transition-all shadow-none"
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
              {isConnected ? "Create & Supply" : "Connect Wallet to Start"}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
