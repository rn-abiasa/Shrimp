import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/layout/Header";
import { Home } from "./pages/Home";
import { Blocks } from "./pages/Blocks";
import { BlockDetail } from "./pages/BlockDetail";
import { Transactions } from "./pages/Transactions";
import { TransactionDetail } from "./pages/TransactionDetail";
import { Address } from "./pages/Address";
import { Mempool } from "./pages/Mempool";
import { Contracts } from "./pages/Contracts";
import { ContractDetail } from "./pages/ContractDetail";
import { Holders } from "./pages/Holders";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/blocks" element={<Blocks />} />
              <Route path="/block/:id" element={<BlockDetail />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/transaction/:id" element={<TransactionDetail />} />
              <Route path="/address/:address" element={<Address />} />
              <Route path="/mempool" element={<Mempool />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/contract/:address" element={<ContractDetail />} />
              <Route path="/holders" element={<Holders />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
