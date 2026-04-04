/**
 * Locale admin dashboard page for `/admin`.
 *
 * Displays locale-level statistics (pending approvals, completed tasks, total badges)
 * and a recent activity feed. Provides quick-action links to badge, task, user,
 * and operator org management.
 *
 * Rendering: Server Component (fetches data) wrapping a client component.
 * Auth: Admin access enforced by `requireAdmin()` in server actions.
 */
import { getShifts, getBadgeDefinitions } from "@/lib/queries/resources"
import { fetchTotalUserCount, fetchAgentDisplayMap } from "@/app/actions/admin"
import { LocaleAdminDashboard } from "./admin-dashboard"

export default async function AdminDashboardPage() {
  const [jobShifts, badges, totalUsers] = await Promise.all([
    getShifts(),
    getBadgeDefinitions(),
    fetchTotalUserCount(),
  ])

  const assigneeIds = new Set<string>()
  for (const shift of jobShifts) {
    for (const task of shift.tasks) {
      if (task.assignedTo) assigneeIds.add(task.assignedTo)
    }
  }

  const agentDisplayMap = await fetchAgentDisplayMap(Array.from(assigneeIds))

  return (
    <LocaleAdminDashboard
      jobShifts={jobShifts}
      badges={badges}
      totalUsers={totalUsers}
      agentDisplayMap={agentDisplayMap}
    />
  )
}
