import SwapCard from "@/components/dex/SwapCard";
import { motion } from "framer-motion";

export default function SwapPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-[480px]"
      >
        <SwapCard />
      </motion.div>
    </div>
  );
}
