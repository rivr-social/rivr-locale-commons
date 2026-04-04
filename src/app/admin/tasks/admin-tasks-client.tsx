"use client"

/**
 * Client-rendered task approval UI for locale admin.
 *
 * Displays tasks grouped by status with approve/reject actions.
 */

import { useState, useMemo, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CheckCircle, XCircle, AlertCircle, Clock, Star } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { approveTaskAction, rejectTaskAction } from "@/app/actions/admin"
import type { JobShift, ProjectRecord } from "@/types/domain"

/** Flattened task with display context. */
interface TaskWithDetails {
  id: string
  name: string
  description: string
  points: number
  completed: boolean
  status: string
  assignedTo?: string
  estimatedTime: string
  jobId: string
  jobTitle: string
  assigneeName: string
  assigneeAvatar: string | null
  projectId: string | null
  projectTitle: string
  shiftResourceId: string
}

interface AdminTasksClientProps {
  jobShifts: JobShift[]
  projects: ProjectRecord[]
  agentDisplayMap: Record<string, { name: string; image: string | null }>
}

/** Status-to-icon mapping. */
const STATUS_ICON: Record<string, typeof AlertCircle> = {
  awaiting_approval: AlertCircle,
  completed: CheckCircle,
  rejected: XCircle,
  pending: Clock,
}

/** Status-to-badge-variant mapping. */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  awaiting_approval: "outline",
  completed: "secondary",
  rejected: "destructive",
  pending: "default",
}

export function AdminTasksClient({ jobShifts, projects, agentDisplayMap }: AdminTasksClientProps) {
  const [activeTab, setActiveTab] = useState("awaiting")
  const [isPending, startTransition] = useTransition()
  const [processedTasks, setProcessedTasks] = useState<Set<string>>(new Set())

  const getAssigneeName = (userId: string) => agentDisplayMap[userId]?.name ?? "Unknown User"
  const getAssigneeAvatar = (userId: string) => agentDisplayMap[userId]?.image ?? null

  /** Flatten all tasks from all job shifts into a single array with display info. */
  const allTasks = useMemo<TaskWithDetails[]>(() => {
    const tasks: TaskWithDetails[] = []
    const projectMap = new Map(projects.map(p => [p.id, p]))

    jobShifts.forEach(shift => {
      shift.tasks.forEach(task => {
        // Find a project that owns this shift's group
        const matchedProject = projects.find(p => p.groupId === shift.groupId) ?? null
        const projectId = matchedProject?.id ?? null
        tasks.push({
          id: task.id,
          name: task.name,
          description: task.description || "",
          points: task.points || 0,
          completed: task.completed || false,
          status: processedTasks.has(task.id) ? "completed" : (task.status || "pending"),
          assignedTo: task.assignedTo,
          estimatedTime: task.estimatedTime || "",
          jobId: shift.id,
          jobTitle: shift.title || "Untitled Shift",
          assigneeName: task.assignedTo ? getAssigneeName(task.assignedTo) : "Unassigned",
          assigneeAvatar: task.assignedTo ? getAssigneeAvatar(task.assignedTo) : null,
          projectId,
          projectTitle: matchedProject?.title ?? "No Project",
          shiftResourceId: shift.id,
        })
      })
    })
    return tasks
  }, [jobShifts, projects, agentDisplayMap, processedTasks])

  const awaitingTasks = allTasks.filter(t => t.status === "awaiting_approval")
  const completedTasks = allTasks.filter(t => t.status === "completed")
  const rejectedTasks = allTasks.filter(t => t.status === "rejected")

  const handleApprove = (task: TaskWithDetails) => {
    startTransition(async () => {
      const result = await approveTaskAction(task.id, task.shiftResourceId)
      if (result.success) {
        setProcessedTasks(prev => new Set(prev).add(task.id))
        toast({ title: "Task approved" })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  const handleReject = (task: TaskWithDetails) => {
    startTransition(async () => {
      const result = await rejectTaskAction(task.id, task.shiftResourceId)
      if (result.success) {
        toast({ title: "Task rejected" })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  const renderTask = (task: TaskWithDetails, showActions: boolean) => {
    const StatusIcon = STATUS_ICON[task.status] ?? Clock
    const variant = STATUS_VARIANT[task.status] ?? "default"

    return (
      <Card key={task.id} className="mb-3">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <Avatar className="h-10 w-10">
                <AvatarImage src={task.assigneeAvatar ?? undefined} alt={task.assigneeName} />
                <AvatarFallback>{task.assigneeName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{task.name}</p>
                <p className="text-sm text-muted-foreground">{task.assigneeName}</p>
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={variant} className="text-xs">
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {task.status.replace(/_/g, " ")}
                  </Badge>
                  {task.points > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      {task.points} pts
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{task.jobTitle}</span>
                </div>
              </div>
            </div>
            {showActions && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => handleApprove(task)} disabled={isPending}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleReject(task)} disabled={isPending}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Task Approval</h1>
        <p className="text-gray-600">Review and approve tasks in this locale</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="awaiting">Awaiting ({awaitingTasks.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedTasks.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="awaiting">
          {awaitingTasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No tasks awaiting approval</p>
          ) : (
            awaitingTasks.map(task => renderTask(task, true))
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedTasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No completed tasks</p>
          ) : (
            completedTasks.map(task => renderTask(task, false))
          )}
        </TabsContent>

        <TabsContent value="rejected">
          {rejectedTasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No rejected tasks</p>
          ) : (
            rejectedTasks.map(task => renderTask(task, false))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
