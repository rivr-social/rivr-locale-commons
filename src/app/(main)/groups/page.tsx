"use client"

/**
 * Groups discovery page in the main app area.
 *
 * Route: `/groups`
 *
 * Purpose:
 * - Display groups from the home-feed dataset.
 * - Filter groups by selected locale/chapter scope and text query.
 * - Provide navigation to individual group pages and group creation flow.
 *
 * Data requirements:
 * - Group feed data from `useHomeFeed(100)`.
 * - Locale metadata from `useLocalesAndBasins()` for scope alias matching.
 * - App context selected chapter from `useAppContext()`.
 *
 * Rendering notes:
 * - Client component (`"use client"`), rendered and hydrated in the browser.
 * - No `metadata` export is defined in this file; metadata is managed elsewhere in the app tree.
 */
import { useState } from "react"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { Plus } from "lucide-react"
import { useGroups } from "@/lib/hooks/use-graph-data"
import Link from "next/link"
import Image from "next/image"
import { useAppContext } from "@/contexts/app-context"
import { useLocalesAndBasins } from "@/lib/hooks/use-graph-data"

/**
 * Renders a searchable, locale-aware list of groups.
 */
export default function GroupsPage() {
  const { state: appState, setSelectedChapter } = useAppContext()
  const [searchQuery, setSearchQuery] = useState("")
  const { groups, state } = useGroups(200)
  const { data: localeData } = useLocalesAndBasins()
  const selectedChapter = appState.selectedChapter || "all"
  // Resolve selected locale so both id and slug aliases can match group chapter tags.
  const selectedLocaleRecord = localeData.locales.find((locale) => locale.id === selectedChapter)
  const selectedScopeAliases = new Set(
    [selectedChapter, selectedLocaleRecord?.slug].filter((value): value is string => !!value)
  )
  const locationNameById = new Map(
    [...localeData.locales, ...localeData.basins].map((place) => [place.id, place.name])
  )

  const resolveGroupLocation = (group: (typeof groups)[number]): string => {
    if (typeof group.location === "string" && group.location.trim().length > 0) {
      return group.location
    }

    const firstTag = group.chapterTags?.[0]
    if (firstTag && locationNameById.has(firstTag)) {
      return locationNameById.get(firstTag) || "Location not specified"
    }

    return "Location not specified"
  }

  // Filter by selected chapter scope and free-text query.
  const filteredGroups = groups.filter((group) => {
    const inChapter =
      selectedChapter === "all" ||
      !!group.chapterTags?.some((tag) => selectedScopeAliases.has(tag))
    const query = searchQuery.trim().toLowerCase()
    const matchesQuery =
      query.length === 0 ||
      group.name.toLowerCase().includes(query) ||
      (group.description || "").toLowerCase().includes(query)
    return inChapter && matchesQuery
  })
  // Show loading indicator until the first data payload arrives.
  const isLoading = (state === "idle" || state === "loading") && filteredGroups.length === 0

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6">
      <div className="flex justify-center mb-4">
        <LocaleSwitcher onLocaleChange={setSelectedChapter} selectedLocale={selectedChapter} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 flex justify-center">
          <div className="border-b-2 border-primary px-4 py-2">
            <span className="text-primary font-medium">Groups</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 bg-muted rounded-full p-2 pl-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search group name"
              className="bg-transparent w-full focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Link href="/create?tab=group&type=group" className="flex items-center gap-3 mb-6">
          <div className="bg-muted rounded-full p-3">
            <Plus className="h-5 w-5" />
          </div>
          <span className="text-lg font-medium">Create a group</span>
        </Link>

        <div className="space-y-4">
          {/* Conditional rendering: loading placeholder, filtered group rows, or empty state. */}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading groups...</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No groups found.</p>
          ) : (
            filteredGroups.map((group) => (
              <Link href={`/groups/${group.id}`} key={group.id} className="flex items-center gap-4 py-2">
                <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                  <Image
                    src={group.avatar || group.image || "/placeholder-event.jpg"}
                    alt={group.name}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-medium">{group.name}</h3>
                  <p className="text-sm text-gray-500">
                    {group.description?.slice(0, 50) || resolveGroupLocation(group)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
