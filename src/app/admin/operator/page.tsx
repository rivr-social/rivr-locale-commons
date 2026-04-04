/**
 * Locale operator org configuration page for `/admin/operator`.
 *
 * Purpose:
 * - Allows locale admins to designate and configure the operator organization
 *   that manages this locale instance.
 * - The operator org (a group/organization agent) owns locale-level memberships,
 *   fee settings, and governance policies.
 * - Uses the existing `nodes.ownerAgentId` and `nodeMemberships` schema to
 *   represent the operator relationship.
 *
 * Data requirements:
 * - Reads the current node record to find the existing ownerAgentId.
 * - Reads groups in this locale instance as candidate operator orgs.
 * - Allows setting/updating the operator org.
 */
import { db } from "@/db"
import { nodes, agents, nodeMemberships } from "@/db/schema"
import { eq, and, isNull, desc, inArray } from "drizzle-orm"
import { OperatorOrgClient } from "./operator-org-client"

/** Serialized group data for the operator org picker. */
export interface OperatorOrgCandidate {
  id: string
  name: string
  image: string | null
  description: string | null
  memberCount: number
}

/** Current operator state passed to the client component. */
export interface OperatorState {
  nodeId: string | null
  currentOperatorId: string | null
  currentOperator: OperatorOrgCandidate | null
  candidates: OperatorOrgCandidate[]
  memberships: OperatorMembership[]
}

/** A membership record for display. */
export interface OperatorMembership {
  id: string
  memberName: string
  memberImage: string | null
  role: string
  status: string
  joinedAt: string
}

async function getOperatorState(): Promise<OperatorState> {
  const primaryAgentId = process.env.PRIMARY_AGENT_ID

  // Find the node record for this locale instance
  let nodeRecord = null
  if (primaryAgentId) {
    const [found] = await db
      .select()
      .from(nodes)
      .where(eq(nodes.primaryAgentId, primaryAgentId))
      .limit(1)

    nodeRecord = found ?? null
  }

  // If no node found, try finding by instance type
  if (!nodeRecord) {
    const [found] = await db
      .select()
      .from(nodes)
      .where(eq(nodes.instanceType, "locale"))
      .limit(1)

    nodeRecord = found ?? null
  }

  const nodeId = nodeRecord?.id ?? null
  const currentOperatorId = nodeRecord?.ownerAgentId ?? null

  // Fetch current operator org details if set
  let currentOperator: OperatorOrgCandidate | null = null
  if (currentOperatorId) {
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        image: agents.image,
        metadata: agents.metadata,
      })
      .from(agents)
      .where(and(eq(agents.id, currentOperatorId), isNull(agents.deletedAt)))
      .limit(1)

    if (agent) {
      const meta = (agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata))
        ? agent.metadata as Record<string, unknown>
        : {}
      currentOperator = {
        id: agent.id,
        name: agent.name,
        image: agent.image,
        description: typeof meta.description === "string" ? meta.description : null,
        memberCount: typeof meta.memberCount === "number" ? meta.memberCount : 0,
      }
    }
  }

  // Fetch candidate organizations (organization/org-type agents)
  const groupAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      image: agents.image,
      metadata: agents.metadata,
    })
    .from(agents)
    .where(and(
      eq(agents.type, "organization"),
      isNull(agents.deletedAt),
    ))
    .orderBy(agents.name)
    .limit(50)

  const candidates: OperatorOrgCandidate[] = groupAgents.map(agent => {
    const meta = (agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata))
      ? agent.metadata as Record<string, unknown>
      : {}
    return {
      id: agent.id,
      name: agent.name,
      image: agent.image,
      description: typeof meta.description === "string" ? meta.description : null,
      memberCount: typeof meta.memberCount === "number" ? meta.memberCount : 0,
    }
  })

  // Fetch node memberships if we have a node
  let memberships: OperatorMembership[] = []
  if (nodeId) {
    const membershipRows = await db
      .select({
        id: nodeMemberships.id,
        memberAgentId: nodeMemberships.memberAgentId,
        role: nodeMemberships.role,
        status: nodeMemberships.status,
        createdAt: nodeMemberships.createdAt,
      })
      .from(nodeMemberships)
      .where(eq(nodeMemberships.nodeId, nodeId))
      .orderBy(desc(nodeMemberships.createdAt))
      .limit(50)

    if (membershipRows.length > 0) {
      const memberIds = membershipRows.map(r => r.memberAgentId)
      const memberAgents = await db
        .select({ id: agents.id, name: agents.name, image: agents.image })
        .from(agents)
        .where(inArray(agents.id, memberIds))

      const agentMap = new Map(memberAgents.map(a => [a.id, a]))

      memberships = membershipRows.map(row => {
        const member = agentMap.get(row.memberAgentId)
        return {
          id: row.id,
          memberName: member?.name ?? "Unknown",
          memberImage: member?.image ?? null,
          role: row.role,
          status: row.status,
          joinedAt: row.createdAt instanceof Date
            ? row.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : String(row.createdAt),
        }
      })
    }
  }

  return {
    nodeId,
    currentOperatorId,
    currentOperator,
    candidates,
    memberships,
  }
}

export default async function OperatorOrgPage() {
  const state = await getOperatorState()
  return <OperatorOrgClient initialState={state} />
}
