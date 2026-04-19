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
  Crown,
  BarChart3,
  Building2,
  CreditCard,
  Shield,
  Users,
  Globe,
} from "lucide-react";

interface EliteUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

const ELITE_BENEFITS = [
  { icon: BarChart3, text: "Executive Dashboard with district-wide compliance and risk analytics" },
  { icon: Building2, text: "District Overview: cross-school reporting and comparison" },
  { icon: Users, text: "Multi-school caseload balancing and resource allocation" },
  { icon: CreditCard, text: "Medicaid billing, claims management, and revenue reporting" },
  { icon: Globe, text: "Agency and contracted provider management" },
  { icon: Shield, text: "Single Sign-On (SSO / SAML) for district-managed authentication" },
];

export function EliteUpgradeModal({ open, onClose, featureName }: EliteUpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center mb-3">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <DialogTitle className="text-xl">
            Upgrade to Trellis ELITE
          </DialogTitle>
          <DialogDescription>
            {featureName
              ? `${featureName} is part of the ELITE plan.`
              : "Built for district leadership teams."}{" "}
            Get enterprise-grade oversight, billing, and control across every school in your district.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 my-2">
          {ELITE_BENEFITS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 text-sm text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            asChild
            className="bg-violet-600 hover:bg-violet-700 text-white w-full gap-2"
          >
            <a href="mailto:sales@trellis.education?subject=ELITE%20Plan%20Inquiry" onClick={onClose}>
              <Crown className="w-4 h-4" />
              Talk to Sales
            </a>
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

export function useEliteUpgradeModal() {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
  };
}
