"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Basin, Chapter } from "@/lib/types"

interface HomeLocaleSelectorProps {
  chapters?: Chapter[]
  basins: Basin[]
  locales?: Chapter[]
  selectedLocaleId?: string | null
  onSelectLocale: (localeId: string) => void
}

export function HomeLocaleSelector({
  chapters,
  basins,
  locales,
  selectedLocaleId,
  onSelectLocale,
}: HomeLocaleSelectorProps) {
  const resolvedLocales = locales ?? chapters ?? []

  if (resolvedLocales.length === 0) {
    return <p className="text-sm text-muted-foreground">No locales available.</p>
  }

  const localesByBasin = new Map<string, Chapter[]>()
  for (const locale of resolvedLocales) {
    const basinLocales = localesByBasin.get(locale.basinId) ?? []
    basinLocales.push(locale)
    localesByBasin.set(locale.basinId, basinLocales)
  }

  const basinOrder = basins.filter((basin) => localesByBasin.has(basin.id))
  const ungrouped = resolvedLocales.filter((locale) => !basins.some((basin) => basin.id === locale.basinId))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Visual locale picker</h3>
        <p className="text-sm text-muted-foreground">
          Choose the commons you want associated with your account.
        </p>
      </div>

      {basinOrder.map((basin) => {
        const basinLocales = localesByBasin.get(basin.id) ?? []
        return (
          <div key={basin.id} className="space-y-2">
            <div>
              <h4 className="text-sm font-semibold">{basin.name}</h4>
              <p className="text-xs text-muted-foreground">
                {basinLocales.length} locale{basinLocales.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {basinLocales.map((locale) => {
                const selected = selectedLocaleId === locale.id
                return (
                  <button
                    key={locale.id}
                    type="button"
                    onClick={() => onSelectLocale(locale.id)}
                    className="text-left"
                  >
                    <Card className={cn("transition-colors", selected && "border-primary ring-2 ring-primary/20")}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{locale.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {locale.description || "No locale description yet."}
                        </p>
                      </CardContent>
                    </Card>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {ungrouped.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Other locales</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {ungrouped.map((locale) => {
              const selected = selectedLocaleId === locale.id
              return (
                <button
                  key={locale.id}
                  type="button"
                  onClick={() => onSelectLocale(locale.id)}
                  className="text-left"
                >
                  <Card className={cn("transition-colors", selected && "border-primary ring-2 ring-primary/20")}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{locale.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {locale.description || "No locale description yet."}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
