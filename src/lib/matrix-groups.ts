"use server";

/**
 * Server-side Matrix group room management.
 *
 * Purpose:
 * - Create and manage Matrix rooms for group agents.
 * - Invite/remove members from group Matrix rooms.
 * - Toggle chat mode (ledger, matrix, both) for groups.
 *
 * Key exports:
 * - `createGroupMatrixRoom` — creates a Matrix room and links it to a group agent.
 * - `inviteToGroupRoom` — invites a user to a group's Matrix room.
 * - `removeFromGroupRoom` — kicks a user from a group's Matrix room.
 * - `setGroupChatMode` — updates the chat mode for a group's Matrix room.
 * - `getGroupMatrixRoom` — fetches the Matrix room record for a group.
 *
 * Dependencies:
 * - `@/lib/env` for Matrix configuration.
 * - `@/db` for group_matrix_rooms table operations.
 * - `@/db/schema` for table definitions.
 */
import { and, eq, or } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { db } from "@/db";
import { createRoomAsUser, inviteToRoomAsUser, joinRoomAsUser, kickFromRoomAsUser } from "@/lib/matrix-admin";
import { agents, groupMatrixRooms, ledger, type ChatMode } from "@/db/schema";
import { randomBytes } from "crypto";

/**
 * Makes an authenticated request to the Synapse Admin API.
 */
async function synapseAdminRequest(path: string, options: RequestInit = {}) {
  const homeserverUrl = getEnv("MATRIX_HOMESERVER_URL");
  const adminToken = getEnv("MATRIX_ADMIN_TOKEN");

  const response = await fetch(`${homeserverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Synapse admin API error: ${response.status} - ${JSON.stringify(error)}`
    );
  }

  return response.json();
}

/**
 * Creates a Matrix room for a group and stores the mapping in group_matrix_rooms.
 *
 * The room is created via the Synapse Admin API as a public group chat.
 * The group's owner (creator) is set as the room admin.
 *
 * @param params.groupAgentId - UUID of the group agent
 * @param params.groupName - Display name for the room
 * @param params.creatorMatrixUserId - Matrix user ID of the group creator
 * @param params.chatMode - Initial chat mode (default: "both")
 * @returns The Matrix room ID and the database record ID
 */
export async function createGroupMatrixRoom(params: {
  groupAgentId: string;
  groupName: string;
  creatorMatrixUserId: string;
  chatMode?: ChatMode;
}): Promise<{ matrixRoomId: string; recordId: string }> {
  // Check if room already exists for this group
  const existing = await db.query.groupMatrixRooms.findFirst({
    where: eq(groupMatrixRooms.groupAgentId, params.groupAgentId),
  });

  if (existing) {
    return { matrixRoomId: existing.matrixRoomId, recordId: existing.id };
  }

  // Create the room ON BEHALF OF the creator via the client-server API.
  // Synapse has no admin room-creation endpoint (`POST /_synapse/admin/v1/rooms`
  // returns 405 M_UNRECOGNIZED) — createRoomAsUser mints a short-lived token
  // for the creator through the admin login endpoint and calls
  // `/_matrix/client/v3/createRoom` as them, so the creator is the room admin.
  //
  // SECURITY (EVT-SEC-007): the alias must NOT be a pure function of the public
  // group agent id. A deterministic `group-<groupId>` alias is publicly
  // computable, so anyone could resolve `#group-<id>:<server>` → `!roomId`
  // through ordinary Matrix alias resolution with no membership — collapsing the
  // "attacker must already know the private room id" precondition for room
  // attacks. We append 64 bits of unpredictable entropy so the alias can't be
  // derived from the group id. RIVR never resolves rooms by alias (the canonical
  // key is `group_matrix_rooms.matrix_room_id`), so the entropy is invisible to
  // the rest of the system; the random suffix also avoids "alias already taken"
  // collisions when a tombstoned group room is re-provisioned.
  const aliasEntropy = randomBytes(8).toString("hex");
  const { roomId: matrixRoomId } = await createRoomAsUser({
    creatorUserId: params.creatorMatrixUserId,
    name: params.groupName,
    topic: `Group chat for ${params.groupName}`,
    preset: "private_chat",
    roomAliasName: `group-${params.groupAgentId.replace(/-/g, "")}-${aliasEntropy}`,
  });

  // Store the mapping
  const [record] = await db
    .insert(groupMatrixRooms)
    .values({
      groupAgentId: params.groupAgentId,
      matrixRoomId,
      chatMode: params.chatMode ?? "both",
    })
    .returning({ id: groupMatrixRooms.id });

  return { matrixRoomId, recordId: record.id };
}

/**
 * Invites a user to a group's Matrix room.
 *
 * Looks up both the group's Matrix room and the target user's Matrix ID,
 * then sends an invite via the Synapse Admin API.
 *
 * @param params.groupAgentId - UUID of the group agent
 * @param params.targetAgentId - UUID of the user agent to invite
 */
export async function inviteToGroupRoom(params: {
  groupAgentId: string;
  targetAgentId: string;
}): Promise<void> {
  const groupRoom = await db.query.groupMatrixRooms.findFirst({
    where: eq(groupMatrixRooms.groupAgentId, params.groupAgentId),
  });

  if (!groupRoom) {
    throw new Error(`No Matrix room found for group ${params.groupAgentId}`);
  }

  const targetAgent = await db.query.agents.findFirst({
    where: eq(agents.id, params.targetAgentId),
    columns: { matrixUserId: true },
  });

  if (!targetAgent?.matrixUserId) {
    throw new Error(
      `Target agent ${params.targetAgentId} has no Matrix account`
    );
  }

  // Private rooms cannot be admin-force-joined (the admin user is not a room
  // member, so Synapse 403s). Instead: a room member with invite power (the
  // room creator) invites the target, then the target joins as themselves.
  const inviterMatrixUserId = await resolveGroupRoomActorMatrixId(params.groupAgentId);
  if (!inviterMatrixUserId) {
    throw new Error(
      `No room actor (creator/admin) resolvable for group ${params.groupAgentId}`,
    );
  }
  await inviteToRoomAsUser({
    inviterUserId: inviterMatrixUserId,
    roomId: groupRoom.matrixRoomId,
    userId: targetAgent.matrixUserId,
  });
  await joinRoomAsUser({
    userId: targetAgent.matrixUserId,
    roomId: groupRoom.matrixRoomId,
  });
}

/**
 * Removes a user from a group's Matrix room by kicking them.
 *
 * @param params.groupAgentId - UUID of the group agent
 * @param params.targetAgentId - UUID of the user agent to remove
 */
export async function removeFromGroupRoom(params: {
  groupAgentId: string;
  targetAgentId: string;
}): Promise<void> {
  const groupRoom = await db.query.groupMatrixRooms.findFirst({
    where: eq(groupMatrixRooms.groupAgentId, params.groupAgentId),
  });

  if (!groupRoom) return; // No room to remove from

  const targetAgent = await db.query.agents.findFirst({
    where: eq(agents.id, params.targetAgentId),
    columns: { matrixUserId: true },
  });

  if (!targetAgent?.matrixUserId) return; // No Matrix account to remove

  // Kick as the room creator (PL 100) — the server-admin token has no power in
  // private rooms the admin never joined (same gap as admin force-join).
  const actorMatrixUserId = await resolveGroupRoomActorMatrixId(params.groupAgentId);
  if (!actorMatrixUserId) return; // No actor to kick with

  await kickFromRoomAsUser({
    actorUserId: actorMatrixUserId,
    roomId: groupRoom.matrixRoomId,
    userId: targetAgent.matrixUserId,
    reason: "Removed from group",
  });
}

/**
 * Resolves the Matrix user id that acts FOR a group's room in server-side
 * membership operations (inviting new members, kicking departed ones): the
 * group's creator/owner (room power level 100), falling back to an
 * admin/moderator member. Returns null when no responsible agent with a
 * provisioned Matrix account exists.
 */
async function resolveGroupRoomActorMatrixId(
  groupAgentId: string,
): Promise<string | null> {
  const ownerEdge = await db.query.ledger.findFirst({
    where: and(
      eq(ledger.objectId, groupAgentId),
      eq(ledger.verb, "own"),
      eq(ledger.isActive, true),
    ),
    columns: { subjectId: true },
  });
  let actorAgentId = ownerEdge?.subjectId ?? null;

  if (!actorAgentId) {
    const adminEdge = await db.query.ledger.findFirst({
      where: and(
        eq(ledger.objectId, groupAgentId),
        eq(ledger.isActive, true),
        or(eq(ledger.verb, "join"), eq(ledger.verb, "belong")),
        or(eq(ledger.role, "admin"), eq(ledger.role, "moderator")),
      ),
      columns: { subjectId: true },
    });
    actorAgentId = adminEdge?.subjectId ?? null;
  }
  if (!actorAgentId) return null;

  const actorAgent = await db.query.agents.findFirst({
    where: eq(agents.id, actorAgentId),
    columns: { matrixUserId: true },
  });
  return actorAgent?.matrixUserId ?? null;
}

/**
 * Updates the chat mode for a group's Matrix room.
 *
 * @param params.groupAgentId - UUID of the group agent
 * @param params.chatMode - New chat mode ("ledger", "matrix", or "both")
 */
export async function setGroupChatMode(params: {
  groupAgentId: string;
  chatMode: ChatMode;
}): Promise<void> {
  await db
    .update(groupMatrixRooms)
    .set({
      chatMode: params.chatMode,
      updatedAt: new Date(),
    })
    .where(eq(groupMatrixRooms.groupAgentId, params.groupAgentId));
}

/**
 * Fetches the Matrix room record for a group agent.
 *
 * @param groupAgentId - UUID of the group agent
 * @returns The group Matrix room record, or null if none exists
 */
export async function getGroupMatrixRoom(groupAgentId: string) {
  return db.query.groupMatrixRooms.findFirst({
    where: eq(groupMatrixRooms.groupAgentId, groupAgentId),
  }) ?? null;
}
