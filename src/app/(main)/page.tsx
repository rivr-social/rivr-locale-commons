import { redirect } from "next/navigation"

/**
 * Locale instance root page.
 * Redirects to the locale's detail page.
 * The locale page shows: groups in this locale, events, marketplace, people.
 */
export default function LocaleHome() {
  const primaryAgentId = process.env.PRIMARY_AGENT_ID
  if (!primaryAgentId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">
          Locale instance not configured. Set PRIMARY_AGENT_ID environment variable.
        </p>
      </div>
    )
  }
  // Locales are organizations with placeType metadata
  // Route to the groups listing filtered by this locale
  redirect(`/groups/${primaryAgentId}`)
}
