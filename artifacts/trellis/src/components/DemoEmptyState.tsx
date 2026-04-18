import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useActiveDemoDistrict } from "@/components/DemoBanner";

interface DemoEmptyStateProps {
  /**
   * One-sentence explanation of what real onboarding would do here.
   * Example: "Real tenants add contracted service agencies during onboarding."
   */
  setupHint: string;
  /** Render compactly (less vertical padding). Defaults to true. */
  compact?: boolean;
  /** Optional override of the demo-mode title. */
  title?: string;
  /**
   * The standard production empty-state markup. Rendered as-is when the
   * current district is NOT a demo district, so we do not damage the real
   * product UX.
   */
  children: ReactNode;
}

/**
 * Empty-state wrapper that swaps copy when the current district is a demo
 * tenant. On demo districts, renders an honest "Not included in this sample
 * dataset" notice instead of an unexplained blank table — important so
 * pilots and product tours don't look broken when they hit modules that the
 * sample data intentionally doesn't seed (agencies, contract utilization,
 * Medicaid claims queue, audit log, etc.).
 *
 * On real (non-demo) districts, this is a transparent passthrough that
 * renders `children` so the standard "no data yet — get started" UX is
 * preserved.
 */
export function DemoEmptyState({
  setupHint,
  compact = true,
  title = "Not included in this sample dataset",
  children,
}: DemoEmptyStateProps) {
  const demoDistrict = useActiveDemoDistrict();
  if (!demoDistrict) return <>{children}</>;

  return (
    <EmptyState
      icon={FlaskConical}
      title={title}
      description={setupHint}
      compact={compact}
    >
      <p
        className="text-[12px] text-gray-500 max-w-md mx-auto text-center"
        data-testid="text-demo-empty-state-context"
      >
        You're viewing{" "}
        <span className="font-medium text-gray-700">{demoDistrict.name}</span>,
        a sample district used for product tours. This module is populated
        during real onboarding — it is intentionally empty in the sample.
      </p>
    </EmptyState>
  );
}
