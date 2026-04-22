/**
 * Seed Overhaul V2 — W4 persistence layer barrel.
 *
 * This is the bridge between the W3 simulator (pure events) and the
 * real operational tables (session_logs, alerts, comp_obligations,
 * schedule_blocks, action_item_handling). See the per-module docs for
 * the no-cheating contracts and rollback safety guarantees.
 */
export {
  PERSISTENCE_LAYER_VERSION,
  runSimulationOverlayForDistrict,
  type RunOverlayOptions,
  type RunOverlayResult,
} from "./runOverlay";
export {
  buildPersistenceMapping,
  classifyServiceTypeName,
  type PersistenceMapping,
  type MappedStudent,
  type MappedServiceRequirement,
} from "./mapping";
export {
  buildPersistencePayload,
  type BuildPersistencePayloadInput,
  type PersistencePayload,
  type PersistenceCounts,
  type InsertHandlingEventRow,
} from "./payload";
