import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSchoolContext } from "./school-context";
import {
  type DistrictTier, type FeatureKey,
  isTierFeatureAccessible, getRequiredTierForFeature,
  getModuleForFeature, TIER_LABELS, MODULE_LABELS, MODULE_DESCRIPTIONS,
  TIER_MODULES,
} from "./module-tiers";

type BillingMode = "paid" | "trial" | "pilot" | "demo" | "unconfigured";

interface TierContextType {
  tier: DistrictTier;
  mode: BillingMode;
  addOns: string[];
  loading: boolean;
  hasAccess: (featureKey: FeatureKey) => boolean;
  getFeatureInfo: (featureKey: FeatureKey) => {
    accessible: boolean;
    requiredTier: DistrictTier;
    requiredTierLabel: string;
    moduleName: string;
    moduleDescription: string;
  };
}

const TierContext = createContext<TierContextType | null>(null);

export function TierProvider({ children }: { children: ReactNode }) {
  const { selectedDistrictId } = useSchoolContext();
  const isDevMode = import.meta.env.DEV;
  // Dev defaults: enterprise + demo so every feature is unlocked when running locally.
  // The server response (when reachable) overrides these with the real district mode.
  const [tier, setTier] = useState<DistrictTier>(isDevMode ? "enterprise" : "essentials");
  const [mode, setMode] = useState<BillingMode>(isDevMode ? "demo" : "unconfigured");
  const [addOns, setAddOns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDistrictId) params.set("districtId", String(selectedDistrictId));

    const baseUrl = import.meta.env.BASE_URL || "/";
    fetch(`${baseUrl}api/district-tier?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.effectiveTier) setTier(data.effectiveTier as DistrictTier);
        if (data.mode) setMode(data.mode as BillingMode);
        if (Array.isArray(data.addOns)) setAddOns(data.addOns);
        setLoading(false);
      })
      .catch(() => {
        if (!isDevMode) setTier("essentials");
        setLoading(false);
      });
  }, [selectedDistrictId, isDevMode]);

  function hasAccess(featureKey: FeatureKey): boolean {
    // Demo and pilot districts get full access regardless of base tier.
    if (mode === "demo" || mode === "pilot") return true;
    if (isTierFeatureAccessible(tier, featureKey)) return true;
    // Add-on grant for à la carte module purchases.
    const moduleKey = getModuleForFeature(featureKey);
    return !!moduleKey && addOns.includes(moduleKey);
  }

  function getFeatureInfo(featureKey: FeatureKey) {
    // Use the shared hasAccess() helper so demo/pilot bypass and add-on grants
    // are honored — otherwise FeatureGate would still show upgrade walls to
    // demo/pilot users while the API allows the request through.
    const accessible = hasAccess(featureKey);
    const requiredTier = getRequiredTierForFeature(featureKey);
    const module = getModuleForFeature(featureKey);
    return {
      accessible,
      requiredTier,
      requiredTierLabel: TIER_LABELS[requiredTier],
      moduleName: module ? MODULE_LABELS[module] : "",
      moduleDescription: module ? MODULE_DESCRIPTIONS[module] : "",
    };
  }

  return (
    <TierContext.Provider value={{ tier, mode, addOns, loading, hasAccess, getFeatureInfo }}>
      {children}
    </TierContext.Provider>
  );
}

export function useTier() {
  const ctx = useContext(TierContext);
  if (!ctx) throw new Error("useTier must be used within TierProvider");
  return ctx;
}

export function useFeatureAccess(featureKey: FeatureKey) {
  const { tier, hasAccess, getFeatureInfo } = useTier();
  const info = getFeatureInfo(featureKey);
  return {
    accessible: info.accessible,
    currentTier: tier,
    requiredTier: info.requiredTier,
    requiredTierLabel: info.requiredTierLabel,
    moduleName: info.moduleName,
    moduleDescription: info.moduleDescription,
  };
}

export { type DistrictTier, type FeatureKey, TIER_LABELS, TIER_MODULES, MODULE_LABELS };
