/**
 * Locale admin task approval page for `/admin/tasks`.
 *
 * Displays tasks across job shifts with approve/reject controls.
 * Rendering: Server Component wrapping client `AdminTasksClient`.
 */
import { getShifts, getProjects } from "@/lib/queries/resources"
import { fetchAgentDisplayMap } from "@/app/actions/admin"
import { AdminTasksClient } from "./admin-tasks-client"

export default async function AdminTasksPage() {
  const [jobShifts, projects] = await Promise.all([
    getShifts(),
    getProjects(),
  ])

  const assigneeIds = new Set<string>()
  for (const shift of jobShifts) {
    for (const task of shift.tasks) {
      if (task.assignedTo) assigneeIds.add(task.assignedTo)
    }
  }

  const agentDisplayMap = await fetchAgentDisplayMap(Array.from(assigneeIds))

  return (
    <AdminTasksClient
      jobShifts={jobShifts}
      projects={projects}
      agentDisplayMap={agentDisplayMap}
    />
  )
}
