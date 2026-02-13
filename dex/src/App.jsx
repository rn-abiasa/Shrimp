import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import Layout from "@/components/layout/Layout";
import SwapPage from "@/pages/SwapPage";
import PoolPage from "@/pages/PoolPage";
import ExplorePage from "@/pages/ExplorePage";
import TokenDetailPage from "@/pages/TokenDetailPage";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="shrimp-dex-theme">
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<SwapPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/token/:address" element={<TokenDetailPage />} />
              <Route path="/pools" element={<PoolPage />} />
              <Route
                path="/stats"
                element={
                  <div className="text-center py-20 text-muted-foreground">
                    Stats coming soon...
                  </div>
                }
              />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
