"use client"

/**
 * Client-rendered graph trace component for locale admin.
 *
 * Provides search and entity type filtering over the locale's agent graph.
 * Uses the existing AgentGraph component for visualization.
 */

import { useState } from "react"
import dynamic from "next/dynamic"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, Network, Users, Building2, Calendar, Briefcase } from "lucide-react"
import { useHomeFeed } from "@/lib/hooks/use-graph-data"

/** Dynamic load of the agent graph. */
const AgentGraph = dynamic(
  () => import("@/components/agent-graph").then((mod) => mod.AgentGraph),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20 text-muted-foreground">Loading graph...</div> }
)

/** Entity type filter options for graph exploration. */
const ENTITY_TYPE_FILTERS = [
  { key: "all", label: "All", icon: Network },
  { key: "person", label: "People", icon: Users },
  { key: "group", label: "Groups", icon: Building2 },
  { key: "event", label: "Events", icon: Calendar },
  { key: "project", label: "Projects", icon: Briefcase },
] as const

type FilterKey = (typeof ENTITY_TYPE_FILTERS)[number]["key"]

export function GraphTraceClient() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const { data: graphData, state: feedState } = useHomeFeed()

  const entityCounts = {
    people: graphData.people?.length ?? 0,
    groups: graphData.groups?.length ?? 0,
    events: graphData.events?.length ?? 0,
    projects: graphData.projects?.length ?? 0,
  }

  const totalEntities = entityCounts.people + entityCounts.groups + entityCounts.events + entityCounts.projects

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search entities..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {ENTITY_TYPE_FILTERS.map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setActiveFilter(filter.key)}
            >
              <filter.icon className="h-3.5 w-3.5" />
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{totalEntities} total entities</Badge>
        <Badge variant="outline">{entityCounts.people} people</Badge>
        <Badge variant="outline">{entityCounts.groups} groups</Badge>
        <Badge variant="outline">{entityCounts.events} events</Badge>
        <Badge variant="outline">{entityCounts.projects} projects</Badge>
      </div>

      {/* Graph */}
      <div className="rounded-lg border bg-muted/30 min-h-[500px]">
        {feedState === "loading" ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Loading entity graph...
          </div>
        ) : (
          <AgentGraph
            agentId={process.env.NEXT_PUBLIC_PRIMARY_AGENT_ID ?? "locale"}
            agentName="Locale"
            agentType="locale"
          />
        )}
      </div>
    </div>
  )
}
