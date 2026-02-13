import Navbar from "./Navbar";

export default function Layout({ children }) {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Navbar />
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-6 py-6 md:py-8 pb-20">
        {children}
      </main>

      <footer className="border-t bg-muted/30 p-6">
        <div className="max-w-[1440px] mx-auto px-4 md:px-6 flex flex-col items-center justify-between gap-4 md:flex-row md:h-16">
          <p className="text-xs text-muted-foreground">
            Built on{" "}
            <span className="font-semibold text-foreground">ShrimpChain</span>.
            Data powered by ShrimpSwap AMM.
          </p>
          <span className="text-xs text-muted-foreground">
            © 2026 ShrimpSwap ECO
          </span>
        </div>
      </footer>
    </div>
  );
}
