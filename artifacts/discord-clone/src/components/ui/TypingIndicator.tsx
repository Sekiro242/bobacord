import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
  size?: "sm" | "md";
}

export function TypingIndicator({ className, size = "md" }: TypingIndicatorProps) {
  const dotSize = size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";
  
  return (
    <div className={cn("flex items-center", gap, "px-1.5 py-1 rounded-full bg-white/5 border border-white/10 w-fit", className)}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn("rounded-full bg-white/70", dotSize)}
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: "loop",
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}
