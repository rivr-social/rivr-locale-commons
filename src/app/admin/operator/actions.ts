"use server"

/**
 * Server actions for operator org management.
 *
 * Sets the ownerAgentId on the locale's node record to designate
 * which organization operates this locale instance.
 *
 * Auth: requires admin privileges via `requireAdmin()`.
 */

import { db } from "@/db"
import { nodes, agents } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"

/** Standard result shape for operator actions. */
interface OperatorActionResult {
  success: boolean
  message: string
}

/** Error codes for operator actions. */
const AUTH_ERROR_UNAUTHORIZED = "Unauthorized"
const AUTH_ERROR_FORBIDDEN = "Forbidden: admin privileges required"

/**
 * Verifies the current session user has platform admin privileges.
 */
async function requireAdmin(): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id ?? null
  if (!userId) throw new Error(AUTH_ERROR_UNAUTHORIZED)

  const [agent] = await db
    .select({ metadata: agents.metadata })
    .from(agents)
    .where(eq(agents.id, userId))
    .limit(1)

  if (!agent) throw new Error(AUTH_ERROR_UNAUTHORIZED)

  const metadata =
    agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
      ? (agent.metadata as Record<string, unknown>)
      : {}

  if (metadata.siteRole !== "admin") {
    throw new Error(AUTH_ERROR_FORBIDDEN)
  }

  return userId
}

/**
 * Sets the operator organization for this locale instance.
 *
 * Updates `nodes.ownerAgentId` on the locale's node record.
 *
 * @param orgId - The agent ID of the group/organization to set as operator.
 */
export async function setOperatorOrg(orgId: string): Promise<OperatorActionResult> {
  await requireAdmin()

  // Verify the org exists and is a group-type agent
  const [org] = await db
    .select({ id: agents.id, type: agents.type })
    .from(agents)
    .where(and(eq(agents.id, orgId), isNull(agents.deletedAt)))
    .limit(1)

  if (!org) {
    return { success: false, message: "Organization not found" }
  }

  if (org.type !== "organization" && org.type !== "org") {
    return { success: false, message: "Selected agent is not an organization/group" }
  }

  // Find the node record for this locale
  const primaryAgentId = process.env.PRIMARY_AGENT_ID

  let nodeRecord = null
  if (primaryAgentId) {
    const [found] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.primaryAgentId, primaryAgentId))
      .limit(1)

    nodeRecord = found ?? null
  }

  if (!nodeRecord) {
    const [found] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.instanceType, "locale"))
      .limit(1)

    nodeRecord = found ?? null
  }

  if (!nodeRecord) {
    return { success: false, message: "No node record found for this locale instance. Ensure a node is configured." }
  }

  // Update the ownerAgentId
  await db
    .update(nodes)
    .set({
      ownerAgentId: orgId,
      updatedAt: new Date(),
    })
    .where(eq(nodes.id, nodeRecord.id))

  revalidatePath("/admin/operator")
  revalidatePath("/admin")

  return { success: true, message: "Operator organization updated" }
}
