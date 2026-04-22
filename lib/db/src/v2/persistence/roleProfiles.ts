/**
 * Seed Overhaul V2 — Operator role usage profiles (W4).
 *
 * The simulator emits every *potential* handling-state transition for
 * every open alert. In real districts those transitions don't all
 * happen — different operators have visibly different behavior:
 *
 *   admin_backlog_sweeper      sweeps a queue at end of cycle; resolves
 *                              quickly with terse notes.
 *   conscientious_case_manager triages everything promptly with rich
 *                              notes; rarely lets state stagnate.
 *   overloaded_provider        responds late and keeps alerts parked
 *                              in `awaiting_confirmation` /
 *                              `recovery_scheduled` longer than ideal.
 *   sparse_note_para           takes some action but frequently leaves
 *                              the note field NULL.
 *   nearly_inactive            triages once and then goes silent —
 *                              their alerts persist at `needs_action`.
 *
 * This module is the bridge between the simulator's "all transitions"
 * stream and the DB's "what actually happened" snapshot. It is invoked
 * by `buildPersistencePayload` to:
 *
 *   1. Deterministically assign a profile to every alert (stable
 *      across re-runs given the same alertRef + districtId).
 *   2. Filter the per-alert handling event sequence so the persisted
 *      stream and `latest.toState` reflect the profile's behavior.
 *   3. Provide profile-specific attribution (assignedToUserId, name,
 *      role) and note styling for the handling rows.
 *
 * Determinism: profile assignment uses an FNV-1a hash of
 * `${districtId}|${alertRef}` so the same alert in the same district
 * always lands on the same profile. Profile mix is uniform across the
 * 5 profiles — a 5-bucket modulo of the hash.
 *
 * No-cheating contract:
 *   - Filtering only DROPS events from the simulator's emitted
 *     sequence; it never INVENTS a transition that the simulator did
 *     not emit. Dropping a transition is a faithful model of an
 *     operator who did not act, which is the whole point of these
 *     profiles. Consequently `latest.toState` may be earlier in the
 *     transition graph than the simulator's last emitted event — that
 *     is the truth being modeled.
 *   - Notes can be null (sparse_note_para) but are never copied
 *     verbatim from one alert onto another; each note is generated
 *     from the profile + (fromState, toState) tuple alone.
 *   - Attribution metadata (userId, name, role) is profile-stable but
 *     not real Clerk users; the DB writer uses opaque
 *     `system:profile-<id>` user ids so query paths can detect
 *     simulator-attributed rows.
 */

import type { SimulatedHandlingEvent, SimulatedHandlingState } from "../simulator";

export type RoleProfileId =
  | "admin_backlog_sweeper"
  | "conscientious_case_manager"
  | "overloaded_provider"
  | "sparse_note_para"
  | "nearly_inactive";

export interface RoleProfile {
  id: RoleProfileId;
  displayName: string;
  /** What the UI shows in the "assigned to role" column. */
  assignedToRole: "admin" | "case_manager" | "provider" | "para" | "coordinator";
  /** Same as `assignedToRole` but is also persisted as the
   *  recommended owner — these profiles are the recommendation. */
  recommendedOwnerRole: "admin" | "case_manager" | "provider" | "para" | "coordinator";
  /** Opaque user id used in the DB. NEVER a real Clerk id. */
  userIdSlug: string;
  /** Display name persisted alongside the userId. */
  userDisplayName: string;
}

const PROFILES: ReadonlyArray<RoleProfile> = [
  {
    id: "admin_backlog_sweeper",
    displayName: "Admin backlog sweeper",
    assignedToRole: "admin",
    recommendedOwnerRole: "admin",
    userIdSlug: "admin-sweeper",
    userDisplayName: "P. Whitfield (admin · sweeper)",
  },
  {
    id: "conscientious_case_manager",
    displayName: "Conscientious case manager",
    assignedToRole: "case_manager",
    recommendedOwnerRole: "case_manager",
    userIdSlug: "cm-conscientious",
    userDisplayName: "M. Alvarez (case manager)",
  },
  {
    id: "overloaded_provider",
    displayName: "Overloaded provider",
    assignedToRole: "provider",
    recommendedOwnerRole: "provider",
    userIdSlug: "provider-overloaded",
    userDisplayName: "K. Singh (SLP · 1.4 FTE caseload)",
  },
  {
    id: "sparse_note_para",
    displayName: "Sparse-note para",
    assignedToRole: "para",
    recommendedOwnerRole: "para",
    userIdSlug: "para-sparse",
    userDisplayName: "J. Boudreau (para)",
  },
  {
    id: "nearly_inactive",
    displayName: "Nearly inactive user",
    assignedToRole: "coordinator",
    recommendedOwnerRole: "coordinator",
    userIdSlug: "coord-inactive",
    userDisplayName: "R. Park (coordinator · low engagement)",
  },
];

export const ALL_ROLE_PROFILES: ReadonlyArray<RoleProfile> = PROFILES;

const PROFILE_BY_ID: Map<RoleProfileId, RoleProfile> = new Map(PROFILES.map((p) => [p.id, p]));

export function getRoleProfile(id: RoleProfileId): RoleProfile {
  const p = PROFILE_BY_ID.get(id);
  if (!p) throw new Error(`[v2/persistence] unknown role profile id "${id}"`);
  return p;
}

/**
 * FNV-1a 32-bit. Good enough for stable bucketing; not for security.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned.
  return h >>> 0;
}

/**
 * Deterministic profile assignment. Same (districtId, alertRef) →
 * same profile across runs.
 */
export function assignProfileToAlert(
  districtId: number,
  alertRef: string,
): RoleProfile {
  const h = fnv1a(`${districtId}|${alertRef}`);
  return PROFILES[h % PROFILES.length];
}

export interface PerAlertProfileFilterResult {
  profile: RoleProfile;
  /** Events the profile actually performed; subset of input, in input order. */
  emitted: SimulatedHandlingEvent[];
  /** The last toState reached after `emitted` is replayed. Equal to
   *  `emitted[emitted.length - 1].toState` when emitted is non-empty,
   *  otherwise undefined (caller should skip writing a handling row). */
  latestState: SimulatedHandlingState | undefined;
  /** Number of events the profile DROPPED. Surfaced so tests + the
   *  PersistenceCounts diagnostics can show that profile filtering is
   *  active without scanning the full event stream. */
  droppedEventCount: number;
}

/**
 * Apply the profile's behavior model to the simulator's per-alert
 * event sequence. The simulator's events are already day-ordered.
 */
export function filterEventsForProfile(
  profile: RoleProfile,
  events: ReadonlyArray<SimulatedHandlingEvent>,
): PerAlertProfileFilterResult {
  if (events.length === 0) {
    return { profile, emitted: [], latestState: undefined, droppedEventCount: 0 };
  }
  const out: SimulatedHandlingEvent[] = [];
  let dropped = 0;

  switch (profile.id) {
    case "conscientious_case_manager":
    case "admin_backlog_sweeper": {
      // Active operators — every transition the simulator emitted
      // actually happened. Rich-attribution operators don't lose
      // events.
      out.push(...events);
      break;
    }
    case "overloaded_provider": {
      // Stalls in the middle of the chain: drop transitions that
      // would advance OUT of `awaiting_confirmation` or
      // `recovery_scheduled` (their queue piles up). We still keep
      // the entries that ENTER those states, and we still keep
      // anything outside that pair (so handed_off / under_review
      // chains progress normally for non-provider hand-offs).
      for (const ev of events) {
        const stalling = ev.fromState === "awaiting_confirmation" || ev.fromState === "recovery_scheduled";
        if (stalling && ev.toState === "resolved") {
          dropped++;
          continue;
        }
        out.push(ev);
      }
      break;
    }
    case "sparse_note_para": {
      // Behaviorally normal — keeps all events. Note redaction is
      // applied later in `noteForEvent` / `noteForState`.
      out.push(...events);
      break;
    }
    case "nearly_inactive": {
      // Triages exactly once. The first emitted event lands; nothing
      // afterward is recorded against this alert by this user.
      out.push(events[0]);
      dropped = events.length - 1;
      break;
    }
  }

  const latestState = out.length === 0 ? undefined : out[out.length - 1].toState;
  return { profile, emitted: out, latestState, droppedEventCount: dropped };
}

/**
 * Note for the *current* handlingState row (collapsed snapshot). Some
 * profiles intentionally return null to model "operator left the note
 * field blank". The DB column allows null so the writer can persist
 * the gap honestly instead of inventing copy.
 */
export function noteForState(
  profile: RoleProfile,
  state: SimulatedHandlingState,
  alertRefSeed?: string,
): string | null {
  switch (profile.id) {
    case "admin_backlog_sweeper":
      return adminNote(state);
    case "conscientious_case_manager":
      return cmNote(state);
    case "overloaded_provider":
      return providerNote(state);
    case "sparse_note_para":
      return paraNoteOrNull(state, alertRefSeed ?? "S", /*forStateRow*/ true);
    case "nearly_inactive":
      // The single event they did emit gets a one-line note; the
      // collapsed state row mirrors it.
      return inactiveNote(state);
  }
}

export function noteForEvent(
  profile: RoleProfile,
  fromState: SimulatedHandlingState,
  toState: SimulatedHandlingState,
  alertRefSeed?: string,
): string | null {
  switch (profile.id) {
    case "admin_backlog_sweeper":
      return `${adminNote(toState)} (was ${fromState})`;
    case "conscientious_case_manager":
      return `${cmNote(toState)} Previous: ${fromState}.`;
    case "overloaded_provider":
      return `${providerNote(toState)} Carried over from ${fromState}.`;
    case "sparse_note_para":
      return paraNoteOrNull(toState, alertRefSeed ?? "E", /*forStateRow*/ false);
    case "nearly_inactive":
      return inactiveNote(toState);
  }
}

function adminNote(state: SimulatedHandlingState): string {
  switch (state) {
    case "needs_action": return "Sweep — flagged for next batch review.";
    case "awaiting_confirmation": return "Sweep — pinged owner for confirmation.";
    case "recovery_scheduled": return "Sweep — recovery slot booked.";
    case "handed_off": return "Sweep — routed to the case team.";
    case "under_review": return "Sweep — escalated for compliance review.";
    case "resolved": return "Sweep — closed; no further action.";
  }
}

function cmNote(state: SimulatedHandlingState): string {
  switch (state) {
    case "needs_action": return "Triaged the alert this morning; service requirement and recent attendance reviewed.";
    case "awaiting_confirmation": return "Reached out to the provider with a specific make-up window proposal.";
    case "recovery_scheduled": return "Confirmed the make-up block and notified the family.";
    case "handed_off": return "Coordinated handoff with the related-services lead and shared context notes.";
    case "under_review": return "Compliance team paged with the supporting log links.";
    case "resolved": return "All make-up minutes logged and reflected on the parent dashboard.";
  }
}

function providerNote(state: SimulatedHandlingState): string {
  switch (state) {
    case "needs_action": return "Acknowledged — will revisit when the caseload allows.";
    case "awaiting_confirmation": return "Awaiting a free slot to confirm the make-up time.";
    case "recovery_scheduled": return "Slot tentatively held; needs co-treat partner to confirm.";
    case "handed_off": return "Handed off — over current capacity.";
    case "under_review": return "Flagged for team review.";
    case "resolved": return "Caught up after coverage support landed.";
  }
}

function paraNoteOrNull(state: SimulatedHandlingState, seed: string, forStateRow: boolean): string | null {
  // Para drops the note ~60% of the time. Determinism: we hash on
  // (alertRef, state, forStateRow) so the choice is stable per row
  // across runs while varying across rows even within a single state.
  const h = fnv1a(`para|${seed}|${state}|${forStateRow ? "S" : "E"}`);
  if (h % 5 < 3) return null;
  switch (state) {
    case "needs_action": return "Saw the alert.";
    case "awaiting_confirmation": return "Asked teacher.";
    case "recovery_scheduled": return "OK.";
    case "handed_off": return "Passed up.";
    case "under_review": return "Sent.";
    case "resolved": return "Done.";
  }
}

function inactiveNote(state: SimulatedHandlingState): string {
  // The inactive user only ever leaves one note (since
  // filterEventsForProfile keeps only the first event for them).
  // The note is brief and admits no follow-up.
  switch (state) {
    case "needs_action": return "Will look at this later.";
    case "awaiting_confirmation": return "Will look at this later.";
    case "recovery_scheduled": return "Will look at this later.";
    case "handed_off": return "Will look at this later.";
    case "under_review": return "Will look at this later.";
    case "resolved": return "Closed.";
  }
}

/**
 * Build the opaque user id persisted on the handling row. The
 * `system:profile-<slug>` prefix lets query paths recognize
 * simulator-attributed rows without joining on user tables.
 */
export function profileUserId(profile: RoleProfile): string {
  return `system:profile-${profile.userIdSlug}`;
}
