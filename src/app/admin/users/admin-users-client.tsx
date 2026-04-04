"use client"

/**
 * Client-rendered user management UI for locale admin.
 *
 * Supports searching users and toggling active/inactive status.
 */

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search, User, Mail, Shield, CheckCircle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { toggleUserActiveStatus } from "@/app/actions/admin"
import type { AdminUser } from "@/app/actions/admin"

interface AdminUsersClientProps {
  initialUsers: AdminUser[]
}

/**
 * Renders a searchable user list with activation controls for locale admin.
 */
export function AdminUsersClient({ initialUsers }: AdminUsersClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [isPending, startTransition] = useTransition()

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleStatusToggle = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    const newStatus = user.status === "active" ? "inactive" : "active"

    startTransition(async () => {
      const result = await toggleUserActiveStatus(userId)
      if (result.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u))
        toast({ title: result.message })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-gray-600">Manage users in this locale instance</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search users by name or email..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="mb-4 text-sm text-muted-foreground">
        {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} found
      </div>

      <div className="space-y-3">
        {filteredUsers.map(user => (
          <Card key={user.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.image ?? undefined} alt={user.name} />
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {user.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </span>
                      )}
                      <span>Joined {user.joinDate}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {user.badgeCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      {user.badgeCount} badge{user.badgeCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  <Badge variant={user.status === "active" ? "default" : "destructive"} className="text-xs">
                    {user.status === "active" ? (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    ) : null}
                    {user.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusToggle(user.id)}
                    disabled={isPending}
                  >
                    {user.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredUsers.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            {searchQuery ? `No users found matching "${searchQuery}"` : "No users found"}
          </p>
        )}
      </div>
    </div>
  )
}
