'use client'

import { useEffect, useState } from 'react'

export type WeatherState = {
  city: string
  coord: { lat: number; lon: number }
  windSpeed: number
  windDeg: number
  rain1h: number
  rain3h: number
  clouds: number
  temp: number | null
  humidity: number | null
  description: string | null
}

export function useWeather(city: string) {
  const [data, setData] = useState<WeatherState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!city.trim()) return

    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, {
          signal: controller.signal,
        })

        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error ?? 'weather fetch failed')
        }

        setData(json)
      } catch (err) {
        if (err instanceof DOMException) return
        setError(err instanceof Error ? err.message : 'weather fetch failed')
      } finally {
        setLoading(false)
      }
    }, 320)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [city])

  return { data, loading, error }
}
