import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSchoolContext } from "./school-context";
import {
  type DistrictTier, type FeatureKey,
  isTierFeatureAccessible, getRequiredTierForFeature,
  getModuleForFeature, TIER_LABELS, MODULE_LABELS, MODULE_DESCRIPTIONS,
  TIER_MODULES,
} from "./module-tiers";

interface TierContextType {
  tier: DistrictTier;
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
  const [tier, setTier] = useState<DistrictTier>("essentials");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDistrictId) params.set("districtId", String(selectedDistrictId));

    const baseUrl = import.meta.env.BASE_URL || "/";
    fetch(`${baseUrl}api/district-tier?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.effectiveTier) setTier(data.effectiveTier as DistrictTier);
        setLoading(false);
      })
      .catch(() => {
        setTier("essentials");
        setLoading(false);
      });
  }, [selectedDistrictId]);

  function hasAccess(featureKey: FeatureKey): boolean {
    return isTierFeatureAccessible(tier, featureKey);
  }

  function getFeatureInfo(featureKey: FeatureKey) {
    const accessible = isTierFeatureAccessible(tier, featureKey);
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
    <TierContext.Provider value={{ tier, loading, hasAccess, getFeatureInfo }}>
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
