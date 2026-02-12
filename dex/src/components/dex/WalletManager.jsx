import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWebWallet } from "@/hooks/useWebWallet";
import { useAddress } from "@/hooks/useData";
import {
  Clipboard,
  Check,
  RefreshCw,
  LogOut,
  Shield,
  Key,
  AlertCircle,
  Wallet as WalletIcon,
  Layers,
  ExternalLink,
} from "lucide-react";

export function WalletManager() {
  const {
    wallet,
    address,
    balance,
    createWallet,
    importWallet,
    disconnectWallet,
    isConnected,
  } = useWebWallet();

  const { data: addressData, isLoading: isLoadingPortfolio } =
    useAddress(address);

  const [mnemonicInput, setMnemonicInput] = useState("");
  const [newMnemonic, setNewMnemonic] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = () => {
    const m = createWallet();
    setNewMnemonic(m);
    setError(null);
  };

  const handleImport = () => {
    try {
      importWallet(mnemonicInput);
      setMnemonicInput("");
      setError(null);
    } catch (e) {
      setError("Invalid mnemonic. Please check the words and spacing.");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant={isConnected ? "outline" : "default"}
          className={
            isConnected
              ? "bg-slate-900 border-slate-800 gap-2"
              : "bg-pink-500 hover:bg-pink-600 gap-2 font-bold"
          }
        >
          <Shield className="h-4 w-4" />
          {isConnected ? (
            <span className="font-mono text-xs">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          ) : (
            "Connect Wallet"
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[450px] bg-slate-950 border-slate-800 p-0 flex flex-col"
      >
        <div className="p-6 border-b border-slate-800">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Key className="h-5 w-5 text-pink-500" />
              {isConnected ? "Wallet Portfolio" : "Connect Wallet"}
            </SheetTitle>
            <SheetDescription>
              {isConnected
                ? "Manage your assets and wallet settings"
                : "Create or import a wallet to start trading"}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!isConnected ? (
            <div className="p-6">
              <Tabs defaultValue="create" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-slate-900 mb-6">
                  <TabsTrigger value="create">New Wallet</TabsTrigger>
                  <TabsTrigger value="import">Import</TabsTrigger>
                </TabsList>
                <TabsContent value="create" className="space-y-4">
                  {!newMnemonic ? (
                    <div className="text-center space-y-4">
                      <div className="p-12 rounded-2xl bg-slate-900/50 border border-slate-800/50 border-dashed">
                        <RefreshCw className="h-12 w-12 mx-auto text-slate-700 mb-4" />
                        <p className="text-sm text-muted-foreground">
                          Generate a new 12-word recovery phrase to get started.
                        </p>
                      </div>
                      <Button
                        onClick={handleCreate}
                        className="w-full bg-pink-500 hover:bg-pink-600 font-bold py-6 h-auto text-lg"
                      >
                        Generate Phrase
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-xs text-orange-500 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                        <p className="leading-relaxed">
                          Save these 12 words in a safe place. Anyone with this
                          phrase can access your SHRIMP.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {newMnemonic.split(" ").map((word, i) => (
                          <div
                            key={i}
                            className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-sm font-mono flex gap-3"
                          >
                            <span className="text-slate-600 w-4">{i + 1}</span>
                            <span>{word}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        className="w-full gap-2 border-slate-800 h-12"
                        onClick={() => copyToClipboard(newMnemonic)}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Clipboard className="h-4 w-4" />
                        )}
                        {copied ? "Copied!" : "Copy Phrase"}
                      </Button>
                      <Button
                        onClick={() => setNewMnemonic(null)}
                        variant="ghost"
                        className="w-full text-sm text-muted-foreground"
                      >
                        Done
                      </Button>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="import" className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      Recovery Phrase
                    </label>
                    <textarea
                      className="w-full h-32 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm font-mono focus:outline-none focus:border-pink-500/50 transition-colors resize-none"
                      placeholder="Enter your 12-word phrase here..."
                      value={mnemonicInput}
                      onChange={(e) => setMnemonicInput(e.target.value)}
                    />
                    {error && (
                      <p className="text-xs text-red-500 ml-1">{error}</p>
                    )}
                  </div>
                  <Button
                    onClick={handleImport}
                    disabled={!mnemonicInput}
                    className="w-full bg-pink-500 hover:bg-pink-600 font-bold py-6 h-auto text-lg"
                  >
                    Recover Wallet
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Balance Header */}
              <div className="p-6 bg-gradient-to-br from-pink-500/10 to-transparent">
                <div className="text-xs font-bold uppercase tracking-widest text-pink-500/70 mb-2">
                  SHRIMP Balance
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">
                    {(Number(balance) / 1e8).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-xl font-bold text-slate-500">
                    SHRIMP
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-xl p-2 pl-3">
                  <span className="text-[10px] font-mono text-slate-400 truncate grow">
                    {address.slice(0, 20)}...{address.slice(-20)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 hover:bg-slate-800"
                    onClick={() => copyToClipboard(address)}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Clipboard className="h-3 w-3 text-slate-500" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Portfolio List */}
              <div className="p-6 pt-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Layers className="h-3 w-3" />
                    Portfolio
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-slate-500 hover:text-white uppercase font-bold"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>

                <div className="space-y-2">
                  {/* SHRIMP always first */}
                  <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-3 flex items-center justify-between hover:bg-slate-900/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-pink-500/20 flex items-center justify-center text-xl">
                        🦐
                      </div>
                      <div>
                        <div className="font-bold text-sm">SHRIMP</div>
                        <div className="text-[10px] text-slate-500">
                          Native Coin
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">
                        {(Number(balance) / 1e8).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-pink-500 font-bold uppercase">
                        Active
                      </div>
                    </div>
                  </div>

                  {/* Other Tokens */}
                  {isLoadingPortfolio ? (
                    <div className="py-8 text-center text-slate-600 animate-pulse">
                      <Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">Scanning assets...</p>
                    </div>
                  ) : addressData?.tokens?.length > 0 ? (
                    addressData.tokens.map((token) => (
                      <div
                        key={token.contractAddress}
                        className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-3 flex items-center justify-between hover:bg-slate-900/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-xl">
                            🪙
                          </div>
                          <div>
                            <div className="font-bold text-sm">
                              {token.symbol}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate w-32">
                              {token.name}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm">
                            {(Number(token.balance) / 1e8).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
                            {token.contractAddress.slice(0, 4)}...
                            {token.contractAddress.slice(-4)}
                            <ExternalLink className="h-2 w-2" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-700 bg-slate-900/20 rounded-2xl border border-slate-900/50 border-dashed">
                      <WalletIcon className="h-10 w-10 mx-auto mb-2 opacity-10" />
                      <p className="text-xs">No other tokens found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="mt-auto p-6 border-t border-slate-900">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/10 gap-3 px-4 h-12"
                  onClick={disconnectWallet}
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect Wallet
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
