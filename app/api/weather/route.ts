import { NextRequest, NextResponse } from 'next/server'

const OWM_KEY = process.env.OPENWEATHER_API_KEY

export async function GET(req: NextRequest) {
  if (!OWM_KEY) {
    return NextResponse.json(
      { error: 'OPENWEATHER_API_KEY is not configured' },
      { status: 500 }
    )
  }

  const city = req.nextUrl.searchParams.get('city')?.trim()

  if (!city) {
    return NextResponse.json({ error: 'city is required' }, { status: 400 })
  }

  try {
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OWM_KEY}`,
      { next: { revalidate: 300 } }
    )

    if (!geoRes.ok) {
      return NextResponse.json({ error: 'failed to geocode city' }, { status: 502 })
    }

    const geo = (await geoRes.json()) as Array<{
      lat: number
      lon: number
      name: string
      country: string
      state?: string
    }>

    if (!geo[0]) {
      return NextResponse.json({ error: 'city not found' }, { status: 404 })
    }

    const { lat, lon, name, country, state } = geo[0]

    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`,
      { next: { revalidate: 120 } }
    )

    if (!weatherRes.ok) {
      return NextResponse.json({ error: 'failed to fetch weather' }, { status: 502 })
    }

    const weather = await weatherRes.json()

    const normalized = {
      city: [name, state, country].filter(Boolean).join(', '),
      coord: { lat, lon },
      windSpeed: Number(weather.wind?.speed ?? 0),
      windDeg: Number(weather.wind?.deg ?? 0),
      rain1h: Number(weather.rain?.['1h'] ?? 0),
      rain3h: Number(weather.rain?.['3h'] ?? 0),
      clouds: Number(weather.clouds?.all ?? 0),
      temp: typeof weather.main?.temp === 'number' ? weather.main.temp : null,
      humidity: typeof weather.main?.humidity === 'number' ? weather.main.humidity : null,
      description: weather.weather?.[0]?.description ?? null,
    }

    return NextResponse.json(normalized)
  } catch {
    return NextResponse.json({ error: 'weather fetch failed' }, { status: 500 })
  }
}
