/**
 * Shared group-management authorization for server-rendered UI and mutations.
 *
 * Active ledger roles are authoritative. Group metadata remains a compatibility
 * fallback for legacy groups that predate membership-role edges.
 *
 * Identity normalization: callers may pass EITHER a local agent id (NextAuth
 * session) OR a federated viewer's raw home actorId. A federated prime-agent
 * (e.g. an admin homed on another instance acting on their group here) must
 * still be recognized as that group's admin. We never mint a separate local
 * account; instead we normalize the remote actorId to its canonical LOCAL agent
 * id via `federation_entity_map` and authorize the normalized identity.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { agents, federationEntityMap, ledger } from "@/db/schema";

/**
 * Resolve every local agent id that the given identity could be acting as.
 *
 * Always includes the input id (it may already be a local id). Additionally
 * resolves it as a remote `external_entity_id` to any mapped `local_entity_id`
 * so a federated viewer is matched against the local projection/canonical row
 * that actually carries the group's admin edge. Read-only; never mutates.
 */
async function resolveCandidateLocalIds(userId: string): Promise<string[]> {
  const mappings = await db
    .select({ localEntityId: federationEntityMap.localEntityId })
    .from(federationEntityMap)
    .where(
      and(
        eq(federationEntityMap.externalEntityId, userId),
        eq(federationEntityMap.entityType, "agent")
      )
    );

  const ids = new Set<string>([userId]);
  for (const row of mappings) ids.add(row.localEntityId);
  return Array.from(ids);
}

/**
 * Returns true iff the given identity holds active admin/moderator authority
 * over the group. Authority is derived from CANONICAL sources only: an active,
 * unexpired ledger admin/moderator edge, or (legacy fallback) the group's own
 * metadata creator/admin ids. Never trusts a self-asserted attribute.
 */
export async function resolveGroupAdminAuthorization(
  userId: string,
  groupId: string
): Promise<boolean> {
  const now = new Date();
  const candidateIds = await resolveCandidateLocalIds(userId);

  const [adminEntry] = await db
    .select({ id: ledger.id })
    .from(ledger)
    .where(
      and(
        inArray(ledger.subjectId, candidateIds),
        eq(ledger.objectId, groupId),
        eq(ledger.isActive, true),
        or(eq(ledger.verb, "belong"), eq(ledger.verb, "join")),
        or(eq(ledger.role, "admin"), eq(ledger.role, "moderator")),
        or(isNull(ledger.expiresAt), sql`${ledger.expiresAt} > ${now}`)
      )
    )
    .limit(1);

  if (adminEntry) return true;

  const [group] = await db
    .select({ metadata: agents.metadata })
    .from(agents)
    .where(and(eq(agents.id, groupId), isNull(agents.deletedAt)))
    .limit(1);

  if (!group?.metadata || typeof group.metadata !== "object") return false;

  const metadata = group.metadata as Record<string, unknown>;
  const candidateSet = new Set(candidateIds);
  if (typeof metadata.creatorId === "string" && candidateSet.has(metadata.creatorId)) return true;

  return Array.isArray(metadata.adminIds)
    && metadata.adminIds.some((id: unknown) => typeof id === "string" && candidateSet.has(id));
}
