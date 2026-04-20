/**
 * Domain layer for service-delivery primitives. Future call sites should
 * import from this barrel so the domain boundary is enforced at the
 * import level.
 */
export {
  getActiveRequirements,
  getActiveRequirementOnDate,
  type RequirementInterval,
  type RequirementIntervalSource,
  type DateRange,
  type GetActiveRequirementsOpts,
} from "./activeRequirements";
