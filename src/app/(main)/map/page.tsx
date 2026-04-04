"use client"

/**
 * Locale-scoped map page.
 *
 * Route: `/map`
 *
 * For a locale instance, the map shows local entities (groups, events, people)
 * positioned within this locale's geographic area. A link to the full global
 * map is provided via `getGlobalUrl` for broader discovery.
 *
 * Data requirements:
 * - `useGroups()`, `useEvents()`, `usePosts()` for local entity markers.
 * - `getGlobalUrl` for linking to the global map surface.
 *
 * Rendering model:
 * - Client Component due to browser-only map renderer and client hooks.
 * - `MainMap` is dynamically imported with `ssr: false`.
 */
import { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin, ExternalLink, Search, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useGroups, useEvents, usePosts, useMarketplace } from "@/lib/hooks/use-graph-data"
import { getGlobalUrl } from "@/lib/federation/global-url"
import type { MapItem } from "@/components/modules/map"

/** Dynamic import -- map renderer uses browser APIs */
const MainMap = dynamic(
  () => import("@/components/modules/map/MainMap"),
  { ssr: false, loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-zinc-900">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-8 w-8 bg-gray-300 dark:bg-zinc-700 rounded-full mb-2" />
        <div className="h-4 w-32 bg-gray-300 dark:bg-zinc-700 rounded" />
      </div>
    </div>
  )}
)

/** Entity type filter options. */
const ENTITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "group", label: "Groups" },
  { key: "event", label: "Events" },
  { key: "post", label: "Posts" },
  { key: "listing", label: "Listings" },
] as const

type EntityFilterKey = (typeof ENTITY_FILTERS)[number]["key"]

/**
 * Locale map page with local entity markers and a link to the global map.
 */
export default function LocaleMapPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<EntityFilterKey>("all")

  const { groups } = useGroups()
  const { events } = useEvents()
  const { posts } = usePosts()
  const { listings } = useMarketplace()

  const globalMapUrl = getGlobalUrl("/map")

  /**
   * Parses a location string or object into lat/lng coordinates.
   * Returns null if parsing fails.
   */
  const parseGeo = (location: unknown): { lat: number; lng: number } | null => {
    if (!location) return null
    if (typeof location === "object" && location !== null) {
      const loc = location as Record<string, unknown>
      const lat = typeof loc.lat === "number" ? loc.lat : typeof loc.latitude === "number" ? loc.latitude : null
      const lng = typeof loc.lng === "number" ? loc.lng : typeof loc.longitude === "number" ? loc.longitude : null
      if (lat !== null && lng !== null) return { lat, lng }
    }
    if (typeof location === "string") {
      const parts = location.split(",").map(s => parseFloat(s.trim()))
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { lat: parts[0], lng: parts[1] }
      }
    }
    return null
  }

  /**
   * Builds map items from local entities that have geo-parseable location data.
   */
  const mapItems = useMemo<MapItem[]>(() => {
    const items: MapItem[] = []

    if (activeFilter === "all" || activeFilter === "group") {
      groups.forEach((group) => {
        const geo = parseGeo(group.location)
        if (!geo) return
        if (searchQuery && !group.name.toLowerCase().includes(searchQuery.toLowerCase())) return
        items.push({
          id: group.id,
          type: "group",
          name: group.name,
          geo,
        })
      })
    }

    if (activeFilter === "all" || activeFilter === "event") {
      events.forEach((event) => {
        const geo = parseGeo(event.location)
        if (!geo) return
        if (searchQuery && !event.name.toLowerCase().includes(searchQuery.toLowerCase())) return
        items.push({
          id: event.id,
          type: "event",
          name: event.name || event.title || "",
          geo,
        })
      })
    }

    return items
  }, [groups, events, searchQuery, activeFilter])

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header controls */}
      <div className="flex items-center gap-2 p-3 border-b bg-background">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search this locale's map..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1">
          {ENTITY_FILTERS.map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <a
          href={globalMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Global Map
        </a>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <MainMap items={mapItems} />
      </div>

      {/* Item count indicator */}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-background text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        <span>{mapItems.length} location{mapItems.length !== 1 ? "s" : ""} in this locale</span>
      </div>
    </div>
  )
}
