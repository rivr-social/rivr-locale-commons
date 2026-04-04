"use client"

/**
 * Client-rendered operator org configuration UI.
 *
 * Allows locale admins to:
 * - View the current operator org (the group that manages this locale instance).
 * - Select a different org from existing groups to designate as operator.
 * - View current node memberships with roles and status.
 * - Save the operator org assignment via server action.
 *
 * The operator org model uses:
 * - `nodes.ownerAgentId` to identify which org operates this locale node.
 * - `nodeMemberships` to track which agents are members of this node scope.
 */

import { useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Building2,
  Users,
  CheckCircle,
  AlertTriangle,
  Search,
  Shield,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { setOperatorOrg } from "./actions"
import type { OperatorState, OperatorOrgCandidate, OperatorMembership } from "./page"

interface OperatorOrgClientProps {
  initialState: OperatorState
}

export function OperatorOrgClient({ initialState }: OperatorOrgClientProps) {
  const [state, setState] = useState(initialState)
  const [searchQuery, setSearchQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isChanging, setIsChanging] = useState(false)

  const filteredCandidates = state.candidates.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSetOperator = (candidate: OperatorOrgCandidate) => {
    startTransition(async () => {
      const result = await setOperatorOrg(candidate.id)
      if (result.success) {
        setState(prev => ({
          ...prev,
          currentOperatorId: candidate.id,
          currentOperator: candidate,
        }))
        setIsChanging(false)
        toast({ title: `Operator org set to "${candidate.name}"` })
      } else {
        toast({ title: result.message, variant: "destructive" })
      }
    })
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Operator Organization</h1>
        <p className="text-gray-600">
          Configure which organization manages this locale instance, its memberships, and governance.
        </p>
      </div>

      {/* Current operator card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Current Operator
          </CardTitle>
          <CardDescription>
            The designated organization that manages this locale instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.currentOperator ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={state.currentOperator.image ?? undefined} alt={state.currentOperator.name} />
                  <AvatarFallback><Building2 className="h-6 w-6" /></AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-lg">{state.currentOperator.name}</p>
                  {state.currentOperator.description && (
                    <p className="text-sm text-muted-foreground">{state.currentOperator.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {state.currentOperator.memberCount} members
                    </Badge>
                    <Badge className="text-xs bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active Operator
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChanging(!isChanging)}
              >
                {isChanging ? "Cancel" : "Change"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium text-foreground">No operator org configured</p>
                <p className="text-sm">Select an organization below to designate as the locale operator.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Org selector (shown when no operator or changing) */}
      {(!state.currentOperator || isChanging) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Select Operator Organization</CardTitle>
            <CardDescription>
              Choose a group to manage this locale&apos;s memberships, fees, and policies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search organizations..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredCandidates.map(candidate => (
                <div
                  key={candidate.id}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={candidate.image ?? undefined} alt={candidate.name} />
                      <AvatarFallback><Building2 className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{candidate.name}</p>
                      {candidate.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{candidate.description}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSetOperator(candidate)}
                    disabled={isPending || candidate.id === state.currentOperatorId}
                  >
                    {candidate.id === state.currentOperatorId ? "Current" : isPending ? "Setting..." : "Set as Operator"}
                  </Button>
                </div>
              ))}
              {filteredCandidates.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  {searchQuery ? `No organizations matching "${searchQuery}"` : "No organizations available"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Node memberships */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Node Memberships
          </CardTitle>
          <CardDescription>
            Agents with membership roles in this locale node scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.memberships.length > 0 ? (
            <div className="space-y-2">
              {state.memberships.map(membership => (
                <div key={membership.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={membership.memberImage ?? undefined} alt={membership.memberName} />
                      <AvatarFallback>{membership.memberName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{membership.memberName}</p>
                      <p className="text-xs text-muted-foreground">Joined {membership.joinedAt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{membership.role}</Badge>
                    <Badge
                      variant={membership.status === "active" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {membership.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              {state.nodeId ? "No node memberships found" : "No node record configured for this instance"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
