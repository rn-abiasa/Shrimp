import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="relative min-h-screen flex flex-col bg-slate-950 text-slate-50 overflow-hidden">
      {/* Background radial gradient for modern look */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[30%] h-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] rounded-full bg-purple-500/5 blur-[150px]" />
      </div>

      <Navbar />
      <main className="flex-1 container py-8 pb-16">{children}</main>

      <footer className="border-t bg-background/50 backdrop-blur-sm py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row md:py-0">
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0 text-center md:text-left">
            <p className="text-sm leading-loose text-muted-foreground">
              Built on{" "}
              <span className="font-bold text-pink-500">ShrimpChain</span>. Data
              provided by ShrimpSwap AMM.
            </p>
          </div>
          <div className="flex gap-4">
            <span className="text-xs text-muted-foreground">
              © 2026 ShrimpSwap ECO
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
