"use client"

import { useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLocalesAndBasins } from "@/lib/hooks/use-graph-data"

interface LocaleSwitcherProps {
  value?: string
  selectedLocale?: string
  onValueChange?: (localeId: string) => void
  onLocaleChange?: (localeId: string) => void
}

export function LocaleSwitcher({
  value,
  selectedLocale,
  onValueChange,
  onLocaleChange,
}: LocaleSwitcherProps) {
  const { data } = useLocalesAndBasins()
  const resolvedValue = value ?? selectedLocale ?? "all"
  const handleChange = onValueChange ?? onLocaleChange ?? (() => {})

  const options = useMemo(() => {
    const localeOptions = data.locales.map((locale) => ({
      id: locale.id,
      label: locale.name,
    }))

    return [{ id: "all", label: "All locales" }, ...localeOptions]
  }, [data.locales])

  return (
    <Select value={resolvedValue} onValueChange={handleChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select locale" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
