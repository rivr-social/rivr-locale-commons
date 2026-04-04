"use client"

/**
 * Locale-scoped explore hub page with gallery and graph views.
 *
 * Route: `/explore` with optional query params:
 * - `q`: initial search term.
 * - `tab`: initial tab selection ("gallery" or "graph").
 *
 * Adapted from global explore page for locale scope. Content is automatically
 * filtered to the locale's PRIMARY_AGENT_ID context via the app context's
 * selectedChapter, which represents the locale in this instance.
 *
 * Data requirements:
 * - `useHomeFeed()` for groups and events graph data.
 * - `usePosts()` for active post feed data.
 * - App scope from `useAppContext()` for locale-aware filtering.
 */
import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Heart, MessageSquare, LayoutGrid, Share2 } from "lucide-react"
import { useAppContext } from "@/contexts/app-context"
import { useHomeFeed, usePosts } from "@/lib/hooks/use-graph-data"
import type { Post, Group } from "@/lib/types"
import { useSearchParams } from "next/navigation"
import { QueryComposer } from "@/components/query-composer"
import type { LedgerFilter } from "@/components/query-composer"
import { getEntityColor, getEntityLabel } from "@/lib/entity-style"

/** Agent graph component loaded client-only. */
const AgentGraph = dynamic(
  () => import("@/components/agent-graph").then((mod) => mod.AgentGraph),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-20 text-muted-foreground">Loading graph...</div> }
)

/** Unified grid item shape for all content types displayed in the explore grid. */
type ExploreGridItem = {
  id: string
  type: "post" | "event" | "group"
  image: string
  title: string
  author: string
  likes: number
  comments: number
  href: string
  createdAt: string
}

/** Tab value constants. */
const TAB_GALLERY = "gallery"
const TAB_GRAPH = "graph"

/**
 * Renders the locale-scoped explore experience with tabbed views:
 * image gallery and force-directed graph.
 */
export default function LocaleExplorePage() {
  const urlSearchParams = useSearchParams()
  const urlQuery = urlSearchParams.get("q")
  const urlTab = urlSearchParams.get("tab")
  const [searchQuery, setSearchQuery] = useState(() => urlQuery || "")
  const [activeTab, setActiveTab] = useState(() =>
    urlTab === TAB_GRAPH ? TAB_GRAPH : TAB_GALLERY
  )
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter | undefined>(undefined)
  const { state } = useAppContext()
  const selectedChapter = state.selectedChapter

  const { data: graphData, state: graphState } = useHomeFeed()
  const { posts: activePosts, state: postsState } = usePosts()
  const activeGroups = graphData.groups
  const activeEvents = graphData.events
  const isLoadingFeed = graphState === "loading" || postsState === "loading"

  /**
   * Builds a unified, sorted, image-only grid from posts, events, and groups.
   * Items without images are excluded. Results are sorted by recency (newest first).
   */
  const gridItems = useMemo<ExploreGridItem[]>(() => {
    const items: ExploreGridItem[] = []

    activePosts.forEach((post: Post) => {
      if (!post.images || post.images.length === 0) return

      if (selectedChapter !== "all" && !post.chapterTags?.includes(selectedChapter)) return

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!post.content.toLowerCase().includes(q) && !(post.title || "").toLowerCase().includes(q)) return
      }

      items.push({
        id: post.id,
        type: "post",
        image: post.images[0],
        title: post.title || post.content.slice(0, 80),
        author: post.author?.name || "Unknown",
        likes: post.likes || 0,
        comments: post.comments || 0,
        href: `/posts/${post.id}`,
        createdAt: post.createdAt || post.timestamp || "",
      })
    })

    activeEvents.forEach((event) => {
      if (!event.image) return

      const eventAny = event as Record<string, unknown>
      if (selectedChapter !== "all" && !(eventAny.chapterTags as string[] | undefined)?.includes(selectedChapter)) return

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !event.name.toLowerCase().includes(q) &&
          !event.description.toLowerCase().includes(q)
        ) return
      }

      items.push({
        id: event.id,
        type: "event",
        image: event.image,
        title: event.name || event.title || "",
        author: typeof event.organizer === "string" ? event.organizer : "Unknown",
        likes: event.attendees || 0,
        comments: 0,
        href: `/events/${event.id}`,
        createdAt: event.timeframe?.start || "",
      })
    })

    activeGroups.forEach((group: Group) => {
      if (!group.image || group.image === "/placeholder.svg") return

      if (selectedChapter !== "all" && !group.chapterTags?.includes(selectedChapter)) return

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !group.name.toLowerCase().includes(q) &&
          !(group.description || "").toLowerCase().includes(q)
        ) return
      }

      items.push({
        id: group.id,
        type: "group",
        image: group.image,
        title: group.name,
        author: `${group.memberCount} members`,
        likes: group.memberCount || 0,
        comments: 0,
        href: `/groups/${group.id}`,
        createdAt: group.createdAt || "",
      })
    })

    items.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })

    return items
  }, [activePosts, activeEvents, activeGroups, selectedChapter, searchQuery])

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Explore This Locale</h1>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 h-4 w-4 text-blue-500" />
        <Input
          type="search"
          placeholder="Search posts, events, groups in this locale..."
          className="pl-10 border-2 border-border focus-visible:ring-blue-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value={TAB_GALLERY} className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            Gallery
          </TabsTrigger>
          <TabsTrigger value={TAB_GRAPH} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value={TAB_GALLERY} className="mt-0">
          {gridItems.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-0.5">
              {gridItems.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  className="group relative aspect-square overflow-hidden bg-muted"
                >
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors duration-200 flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100">
                    <div>
                      <Badge
                        className="text-white border-0 text-[10px] px-2 py-0.5"
                        style={{ backgroundColor: getEntityColor(item.type) }}
                      >
                        {getEntityLabel(item.type)}
                      </Badge>
                    </div>

                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-white text-sm font-semibold text-center line-clamp-2 px-1">
                        {item.title}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-4 text-white text-xs">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5 fill-white" />
                        {item.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5 fill-white" />
                        {item.comments}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-16">
              {isLoadingFeed
                ? "Loading explore feed..."
                : searchQuery
                  ? `No visual content found for "${searchQuery}" in this locale`
                  : "No visual content available in this locale yet"}
            </p>
          )}
        </TabsContent>

        <TabsContent value={TAB_GRAPH} className="mt-0 space-y-3">
          <div className="rounded-lg border bg-muted/30 min-h-[400px]">
            <AgentGraph
              agentId={process.env.NEXT_PUBLIC_PRIMARY_AGENT_ID ?? "locale"}
              agentName="Locale"
              agentType="locale"
            />
          </div>
          <QueryComposer
            onApply={(filter) => setLedgerFilter(filter)}
            onClear={() => setLedgerFilter(undefined)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
