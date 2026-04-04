/**
 * Locale-scoped project detail page for `/projects/[id]`.
 *
 * Renders a comprehensive project profile with owner info, member list,
 * activity feed, status progress, and action controls.
 *
 * Adapted from global project page for locale scope. Uses the same
 * graph actions and adapters available in rivr-locale-commons.
 *
 * Rendering: Server Component.
 * Data requirements:
 * - Fetches the project agent via `fetchAgent(id)`.
 * - Resolves owner/creator from agent metadata.
 * - Loads child agents via `fetchAgentChildren` for the member list.
 * - Loads recent activity via `fetchAgentFeed`.
 * - Normalizes agent to `Project` type via `agentToProject`.
 */
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  Edit,
  MapPin,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  fetchAgent,
  fetchAgentChildren,
  fetchAgentFeed,
  fetchGroupDetail,
  fetchResourcesByOwner,
} from "@/app/actions/graph"
import { agentToProject } from "@/lib/graph-adapters"
import { buildGroupPageMetadata } from "@/lib/object-metadata"
import { buildProjectStructuredData, serializeJsonLd } from "@/lib/structured-data"
import { ProjectActions } from "@/components/project-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

/** Status-to-progress mapping for project lifecycle stages. */
const STATUS_PROGRESS: Record<string, number> = {
  planning: 0,
  active: 50,
  completed: 100,
}

/** Status-to-badge-variant mapping for visual differentiation. */
const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline",
  active: "default",
  completed: "secondary",
}

/** Status-to-label mapping for display text. */
const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
}

/** Icon mapping for activity feed verb types. */
const VERB_ICON_MAP: Record<string, typeof Star> = {
  create: Plus,
  join: UserPlus,
  update: Edit,
  delete: Trash2,
  comment: MessageSquare,
  like: Star,
}

/** Maximum number of members displayed before the overflow indicator. */
const MAX_VISIBLE_MEMBERS = 10

/** Maximum number of activity feed entries to display. */
const ACTIVITY_FEED_LIMIT = 10

async function getProjectPageData(id: string) {
  const agent = await fetchAgent(id)
  if (!agent) return null

  const project = agentToProject(agent)
  const ownerId = resolveOwnerId(agent.metadata ?? {})
  const projectMeta = (agent.metadata ?? {}) as Record<string, unknown>
  const groupId = typeof projectMeta.groupId === "string" ? projectMeta.groupId : null
  const [owner, children, activity] = await Promise.all([
    ownerId ? fetchAgent(ownerId) : Promise.resolve(null),
    fetchAgentChildren(id),
    fetchAgentFeed(id, ACTIVITY_FEED_LIMIT),
  ])
  const [ownedResources, groupDetail] = await Promise.all([
    fetchResourcesByOwner(id).catch(() => []),
    groupId ? fetchGroupDetail(groupId).catch(() => null) : Promise.resolve(null),
  ])
  const jobResources = ownedResources.filter((resource) => {
    const meta = (resource.metadata ?? {}) as Record<string, unknown>
    return resource.type === "job" || resource.type === "task" || meta.resourceKind === "job" || meta.resourceKind === "task"
  })
  const linkedEvents = (groupDetail?.resources ?? []).filter((resource) => {
    const meta = (resource.metadata ?? {}) as Record<string, unknown>
    return (resource.type === "event" || meta.resourceKind === "event") &&
      String(meta.projectId ?? meta.managingProjectId ?? "") === id
  })

  return {
    agent,
    project,
    ownerId,
    owner,
    children,
    activity,
    linkedEvents,
    jobResources,
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await getProjectPageData(id)

  if (!data) {
    return {
      title: "Project Not Found | Locale",
    }
  }

  return buildGroupPageMetadata(data.agent, `/projects/${data.project.id}`)
}

/**
 * Resolves the owner/creator ID from agent metadata.
 */
function resolveOwnerId(metadata: Record<string, unknown>): string | null {
  if (typeof metadata.creatorId === "string" && metadata.creatorId.length > 0) {
    return metadata.creatorId
  }
  if (typeof metadata.ownerId === "string" && metadata.ownerId.length > 0) {
    return metadata.ownerId
  }
  return null
}

/**
 * Formats an ISO timestamp into a human-readable relative time string.
 */
function formatRelativeTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return "Unknown"
  }
}

function formatProjectDate(timestamp: string | null | undefined): string {
  if (!timestamp) return "Date not set"
  try {
    return new Date(timestamp).toLocaleDateString()
  } catch {
    return "Date not set"
  }
}

/**
 * Server-rendered page component for a single project within this locale.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getProjectPageData(id)

  if (!data) {
    notFound()
  }

  const { agent, project, ownerId, owner, children, activity, linkedEvents, jobResources } = data
  const members = children.filter((child) => child.type === "person")
  const linkedJobCount = jobResources.filter((resource) => resource.type === "job" || ((resource.metadata ?? {}) as Record<string, unknown>).resourceKind === "job").length
  const linkedTaskCount = jobResources.filter((resource) => resource.type === "task" || ((resource.metadata ?? {}) as Record<string, unknown>).resourceKind === "task").length

  const statusKey = project.status || "active"
  const progressValue = STATUS_PROGRESS[statusKey] ?? 50
  const badgeVariant = STATUS_BADGE_VARIANT[statusKey] ?? "default"
  const statusLabel = STATUS_LABEL[statusKey] ?? statusKey

  const visibleMembers = members.slice(0, MAX_VISIBLE_MEMBERS)
  const overflowCount = members.length - visibleMembers.length
  const structuredData = buildProjectStructuredData(project, {
    visibility: agent.visibility ?? null,
    ownerName: owner?.name ?? null,
  })

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-4">
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      ) : null}

      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      {/* Main project card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-2xl">{project.name}</CardTitle>
              {project.description ? (
                <p className="text-muted-foreground">{project.description}</p>
              ) : null}
            </div>
            <Badge variant={badgeVariant}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Users className="h-4 w-4" />
              {project.memberCount || members.length || 0} members
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {project.location || "Location not provided"}
            </span>
            <span className="inline-flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </div>

          {project.chapterTags?.length ? (
            <div className="flex flex-wrap gap-2">
              {project.chapterTags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          ) : null}

          {project.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          ) : null}

          <ProjectActions
            projectId={project.id}
            projectName={project.name}
            projectDescription={project.description}
            ownerId={ownerId}
          />
        </CardContent>
      </Card>

      {/* Owner / project lead card */}
      {owner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/profile/${(owner.metadata?.username as string) || owner.id}`}
              className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Image
                src={owner.image || "/placeholder-user.jpg"}
                alt={owner.name}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
              <div>
                <p className="text-sm font-medium leading-none">{owner.name}</p>
                <p className="text-xs text-muted-foreground mt-1">Project lead</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* Members card */}
      {members.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Members
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({members.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {visibleMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/profile/${(member.metadata?.username as string) || member.id}`}
                  className="flex flex-col items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Image
                    src={member.image || "/placeholder-user.jpg"}
                    alt={member.name}
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                  />
                  <span className="text-xs text-center truncate max-w-[80px]">{member.name}</span>
                </Link>
              ))}
              {overflowCount > 0 ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    +{overflowCount}
                  </div>
                  <span className="text-xs text-muted-foreground">more</span>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Event workstreams card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Event Workstreams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{linkedEvents.length} event{linkedEvents.length !== 1 ? "s" : ""}</Badge>
            <Badge variant="secondary">{linkedJobCount} job{linkedJobCount !== 1 ? "s" : ""}</Badge>
            <Badge variant="secondary">{linkedTaskCount} task{linkedTaskCount !== 1 ? "s" : ""}</Badge>
          </div>
          {linkedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events are linked to this project yet.</p>
          ) : (
            <div className="grid gap-3">
              {linkedEvents.map((event) => {
                const meta = (event.metadata ?? {}) as Record<string, unknown>
                const financialSummary = meta.financialSummary && typeof meta.financialSummary === "object"
                  ? (meta.financialSummary as Record<string, unknown>)
                  : null
                const revenueCents = typeof financialSummary?.revenueCents === "number" ? financialSummary.revenueCents : 0
                const payoutCents = typeof financialSummary?.payoutsCents === "number" ? financialSummary.payoutsCents : 0
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="rounded-lg border p-4 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{event.name}</p>
                        <p className="text-sm text-muted-foreground mt-1">{event.description || "No description yet."}</p>
                      </div>
                      <Badge variant="outline">
                        {formatProjectDate(typeof meta.date === "string" ? meta.date : typeof meta.startDate === "string" ? meta.startDate : event.createdAt)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="secondary">
                        Revenue {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenueCents / 100)}
                      </Badge>
                      <Badge variant="secondary">
                        Payouts {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payoutCents / 100)}
                      </Badge>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity feed card */}
      {activity.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity.map((entry) => {
                const VerbIcon = VERB_ICON_MAP[entry.verb] ?? Briefcase
                const description =
                  typeof entry.metadata?.description === "string"
                    ? entry.metadata.description
                    : `${entry.verb} on ${entry.objectType || "item"}`

                return (
                  <div key={entry.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <VerbIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{description}</p>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
