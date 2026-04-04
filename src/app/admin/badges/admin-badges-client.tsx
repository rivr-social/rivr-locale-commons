"use client"

/**
 * Client-rendered badge management UI for locale admin.
 *
 * Supports viewing all badges, assigning/removing badges from users,
 * and creating new badge definitions.
 */

import { useState, useMemo, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Shield, Plus, X, User } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/components/ui/use-toast"
import { assignBadgeToUser, removeBadgeFromUser, createAdminBadgeAction } from "@/app/actions/admin"
import type { UserBadge } from "@/types/domain"

interface BadgeUser {
  id: string
  name: string
  image: string | null
  type: string
}

/** Badge level options for the creation form. */
const BADGE_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const
type BadgeLevel = (typeof BADGE_LEVELS)[number]

interface AdminBadgesClientProps {
  allBadges: UserBadge[]
  userBadgeMap: Record<string, string[]>
  users: BadgeUser[]
}

/** Filters badges to only those assigned to a specific user. */
function getBadgesForUser(allBadges: UserBadge[], userBadgeIds: string[]): UserBadge[] {
  return allBadges.filter(b => userBadgeIds.includes(b.id))
}

export function AdminBadgesClient({ allBadges: initialBadges, userBadgeMap: initialBadgeMap, users }: AdminBadgesClientProps) {
  const [activeTab, setActiveTab] = useState("manage")
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [allBadges, setAllBadges] = useState(initialBadges)
  const [userBadgeMap, setUserBadgeMap] = useState(initialBadgeMap)

  // Create badge form state
  const [newBadgeName, setNewBadgeName] = useState("")
  const [newBadgeDescription, setNewBadgeDescription] = useState("")
  const [newBadgeLevel, setNewBadgeLevel] = useState<BadgeLevel>("beginner")

  const selectedUserBadges = useMemo(() => {
    if (!selectedUser) return []
    return getBadgesForUser(allBadges, userBadgeMap[selectedUser] ?? [])
  }, [selectedUser, allBadges, userBadgeMap])

  const unassignedBadges = useMemo(() => {
    if (!selectedUser) return allBadges
    const assignedIds = new Set(userBadgeMap[selectedUser] ?? [])
    return allBadges.filter(b => !assignedIds.has(b.id))
  }, [selectedUser, allBadges, userBadgeMap])

  const handleAssign = (badgeId: string) => {
    if (!selectedUser) return
    startTransition(async () => {
      const result = await assignBadgeToUser(selectedUser, badgeId)
      if (result.success) {
        setUserBadgeMap(prev => ({
          ...prev,
          [selectedUser]: [...(prev[selectedUser] ?? []), badgeId],
        }))
        toast({ title: result.message })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  const handleRemove = (badgeId: string) => {
    if (!selectedUser) return
    startTransition(async () => {
      const result = await removeBadgeFromUser(selectedUser, badgeId)
      if (result.success) {
        setUserBadgeMap(prev => ({
          ...prev,
          [selectedUser]: (prev[selectedUser] ?? []).filter(id => id !== badgeId),
        }))
        toast({ title: result.message })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  const handleCreateBadge = () => {
    const trimmedName = newBadgeName.trim()
    const trimmedDescription = newBadgeDescription.trim()
    if (!trimmedName || !trimmedDescription) {
      toast({ title: "Name and description are required", variant: "destructive" })
      return
    }
    startTransition(async () => {
      const result = await createAdminBadgeAction({
        name: trimmedName,
        description: trimmedDescription,
        level: newBadgeLevel,
      })
      if (result.success && result.resourceId) {
        setAllBadges(prev => [...prev, {
          id: result.resourceId!,
          name: trimmedName,
          description: trimmedDescription,
          icon: "",
          category: "community",
          level: newBadgeLevel,
          requirements: [],
          holders: [],
          jobsUnlocked: [],
          trainingModules: [],
        }])
        setNewBadgeName("")
        setNewBadgeDescription("")
        setNewBadgeLevel("beginner")
        setIsDialogOpen(false)
        toast({ title: result.message })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  return (
    <div className="container max-w-6xl mx-auto p-4 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Badge Management</h1>
          <p className="text-gray-600">Manage badges for this locale</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Badge</DialogTitle>
              <DialogDescription>Define a new badge for this locale instance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="badge-name">Name</Label>
                <Input id="badge-name" value={newBadgeName} onChange={(e) => setNewBadgeName(e.target.value)} placeholder="Badge name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="badge-desc">Description</Label>
                <Input id="badge-desc" value={newBadgeDescription} onChange={(e) => setNewBadgeDescription(e.target.value)} placeholder="Badge description" />
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={newBadgeLevel} onValueChange={(v) => setNewBadgeLevel(v as BadgeLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BADGE_LEVELS.map(level => (
                      <SelectItem key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isPending}>Cancel</Button>
              <Button onClick={handleCreateBadge} disabled={isPending}>{isPending ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="manage">Manage Assignments</TabsTrigger>
          <TabsTrigger value="all">All Badges ({allBadges.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="manage">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                      selectedUser === user.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.image ?? undefined} alt={user.name} />
                      <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{user.name}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assigned Badges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedUser ? (
                  <p className="text-sm text-muted-foreground">Select a user to see their badges</p>
                ) : selectedUserBadges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No badges assigned</p>
                ) : (
                  selectedUserBadges.map(badge => (
                    <div key={badge.id} className="flex items-center justify-between p-2 rounded-md border">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">{badge.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(badge.id)} disabled={isPending}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Badges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedUser ? (
                  <p className="text-sm text-muted-foreground">Select a user first</p>
                ) : unassignedBadges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All badges assigned</p>
                ) : (
                  unassignedBadges.map(badge => (
                    <div key={badge.id} className="flex items-center justify-between p-2 rounded-md border">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-gray-400" />
                        <span className="text-sm">{badge.name}</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleAssign(badge.id)} disabled={isPending}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="all">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allBadges.map(badge => (
              <Card key={badge.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Shield className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{badge.name}</p>
                      <p className="text-sm text-muted-foreground">{badge.description}</p>
                      <Badge variant="secondary" className="mt-2 text-xs">{badge.level}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {allBadges.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center py-8">No badges defined yet</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
