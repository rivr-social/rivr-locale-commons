"use client"

/**
 * Reusable entity card used by graph node selection overlays.
 *
 * The card is intentionally a single navigational unit: the whole surface is a
 * `Link` to the entity's page (`item.url`), so clicking anywhere navigates. It
 * normalizes a heterogeneous entity (`event`/`group`/`post`/`offering`/`person`)
 * into one display shape.
 *
 * When `onClose` is provided the card renders a dismiss affordance (used by the
 * graph overlays, which open a card on node click and let the user close it
 * without leaving the graph).
 */

import Link from "next/link"
import Image from "next/image"
import { Calendar, MapPin, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Normalized entity shape rendered by {@link MapCard}. */
export interface MapCardItem {
  id: string
  /** Entity kind — drives the badge icon/color (event/group/post/offering/…). */
  type: string
  name: string
  image?: string
  /** Display location; object form is read via its `address` field. */
  location?: Record<string, unknown> | string
  /** Destination page for the card link. */
  url: string
  /** Event-only: rendered as a formatted start date. */
  timeframe?: { start?: string; end?: string }
  /** Group-only: rendered as a member count. */
  memberCount?: number
}

const FALLBACK_DATE_ISO = "2024-01-01T00:00:00.000Z"

/** Formats an ISO-ish date string for compact card display. */
function formatCardDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** Resolves a display address from string or `{ address }` location shapes. */
function resolveAddress(location: MapCardItem["location"]): string {
  if (typeof location === "string") return location || "Unknown location"
  const address = location?.address
  return (typeof address === "string" && address) || "Unknown location"
}

interface MapCardProps {
  item: MapCardItem
  className?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** When provided, renders a dismiss button (overlay mode). */
  onClose?: () => void
}

export function MapCard({ item, className, onMouseEnter, onMouseLeave, onClose }: MapCardProps) {
  return (
    <Link
      href={item.url}
      className={cn(
        "relative min-w-[200px] max-w-[240px] md:min-w-[280px] md:max-w-[320px] rounded-md border bg-card hover:border-primary transition-colors overflow-hidden flex shrink-0 shadow",
        className,
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative h-20 w-20 md:h-24 md:w-24 shrink-0">
        <Image src={item.image || "/placeholder-event.jpg"} alt={item.name} fill className="object-cover" />
        <div
          className={cn(
            "absolute top-2 left-2 rounded-full w-6 h-6 flex items-center justify-center",
            item.type === "event"
              ? "bg-primary"
              : item.type === "group"
                ? "bg-blue-500"
                : item.type === "post"
                  ? "bg-emerald-500"
                  : "bg-amber-500",
          )}
        >
          {item.type === "event" ? <Calendar className="h-3 w-3 text-white" /> : null}
          {item.type === "group" ? <Users className="h-3 w-3 text-white" /> : null}
          {item.type === "post" ? <MapPin className="h-3 w-3 text-white" /> : null}
          {item.type === "offering" ? <MapPin className="h-3 w-3 text-white" /> : null}
        </div>
      </div>
      <div className="p-2 min-w-0">
        <h3 className="font-medium text-sm truncate">{item.name}</h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <p className="truncate">{resolveAddress(item.location)}</p>
        </div>
        {item.type === "event" && item.timeframe ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <p>{formatCardDate(item.timeframe.start || FALLBACK_DATE_ISO)}</p>
          </div>
        ) : null}
        {item.type === "group" && typeof item.memberCount === "number" ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Users className="h-3 w-3 shrink-0" />
            <p>{item.memberCount || 0} members</p>
          </div>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          className="absolute top-1 right-1 z-10 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </Link>
  )
}
