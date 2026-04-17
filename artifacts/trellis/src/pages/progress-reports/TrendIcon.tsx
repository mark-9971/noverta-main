import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function TrendIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <TrendingUp className="w-4 h-4 text-emerald-600" />;
  if (direction === "declining") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}
