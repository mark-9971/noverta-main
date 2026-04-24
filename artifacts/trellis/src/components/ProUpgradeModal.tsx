import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ArrowUpCircle,
  Activity,
  MessageSquare,
  BarChart3,
  Shield,
  FileText,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";

interface ProUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

const PRO_BENEFITS = [
  { icon: Activity, text: "ABA program data, graphing, and learner progress tracking" },
  { icon: Shield, text: "FBA/BIP management and behavior intervention plans" },
  { icon: Sparkles, text: "AI-powered IEP goal suggestions and premium templates" },
  { icon: FileText, text: "BCBA supervision hour logging and compliance" },
  { icon: MessageSquare, text: "Secure parent communication and document sharing portal" },
  { icon: BarChart3, text: "Engagement analytics and family translation services" },
];

export function ProUpgradeModal({ open, onClose, featureName }: ProUpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-3">
            <ArrowUpCircle className="w-6 h-6 text-white" />
          </div>
          <DialogTitle className="text-xl">
            Upgrade to Noverta PRO
          </DialogTitle>
          <DialogDescription>
            {featureName
              ? `${featureName} is part of the PRO plan.`
              : "Unlock clinical, ABA, and engagement features for your district."}{" "}
            Get everything your team needs to deliver compliant, high-quality services.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 my-2">
          {PRO_BENEFITS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white w-full">
            <Link href="/billing" onClick={onClose}>
              View Plans & Upgrade
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full text-emerald-600 text-sm hover:text-emerald-700">
            <Link href="/upgrade" onClick={onClose}>
              See full comparison →
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full text-gray-500 text-sm"
            onClick={onClose}
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useProUpgradeModal() {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
  };
}
