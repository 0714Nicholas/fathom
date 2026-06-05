'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn(
        '[Fathom] Supabase env not configured. Realtime + archive features disabled.'
      )
    }
    return null
  }

  cached = createClient(url, anonKey, {
    realtime: {
      params: { eventsPerSecond: 8 },
    },
  })

  return cached
}

// ---------------------------------------------------------------------------
// Archive (DB) layer helpers
// ---------------------------------------------------------------------------

export type ArchivedLetter = {
  id: string
  room_id: string
  author_name: string | null
  city: string | null
  text: string
  lang: string | null
  weather_snapshot: Record<string, unknown> | null
  fathom_depth: number | null
  client_created_at: string
  created_at: string
}

export type InsertLetterArgs = {
  id: string
  roomId: string
  authorId: string
  authorName?: string
  city?: string
  text: string
  lang?: string | null
  weatherSnapshot?: Record<string, unknown> | null
  fathomDepth?: number | null
  clientCreatedAt: number
}

/**
 * Fire-and-forget insert.
 * We do NOT await this in the UI flow — the Broadcast already delivered the letter.
 * The DB write only matters for the *future* viewer.
 */
export async function insertLetterArchive(args: InsertLetterArgs): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  try {
    const { error } = await client.from('letters').insert({
      id: args.id,
      room_id: args.roomId,
      author_id: args.authorId,
      author_name: args.authorName ?? null,
      city: args.city ?? null,
      text: args.text,
      lang: args.lang ?? null,
      weather_snapshot: args.weatherSnapshot ?? null,
      fathom_depth: args.fathomDepth ?? null,
      client_created_at: new Date(args.clientCreatedAt).toISOString(),
    })

    if (error) {
      console.warn('[Fathom] failed to archive letter:', error.message)
    }
  } catch (err) {
    console.warn('[Fathom] archive insert threw:', err)
  }
}

/**
 * Fetch surfacing letters for a room.
 * We use the view, which already filters buried.
 * Oldest first so the deep speaks first.
 */
export async function fetchArchivedLetters(
  roomId: string,
  limit = 24
): Promise<ArchivedLetter[]> {
  const client = getSupabaseClient()
  if (!client) return []

  const { data, error } = await client
    .from('surfacing_letters')
    .select(
      'id, room_id, author_name, city, text, lang, weather_snapshot, fathom_depth, client_created_at, created_at'
    )
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.warn('[Fathom] failed to fetch archive:', error.message)
    return []
  }

  return (data ?? []) as ArchivedLetter[]
}

/**
 * Bury (sink further) one of *your own* letters.
 * RPC enforces author ownership.
 */
export async function buryLetter(letterId: string, authorId: string): Promise<boolean> {
  const client = getSupabaseClient()
  if (!client) return false

  const { error } = await client.rpc('bury_letter', {
    p_letter_id: letterId,
    p_author_id: authorId,
  })

  if (error) {
    console.warn('[Fathom] failed to bury letter:', error.message)
    return false
  }

  return true
}

/**
 * Record that a letter surfaced for a reader at a given depth.
 * Fire-and-forget — never block the UI for this.
 */
export async function recordLetterEcho(
  letterId: string,
  readerId: string,
  depth: number | null
): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return

  try {
    const { error } = await client.rpc('echo_letter', {
      p_letter_id: letterId,
      p_reader_id: readerId,
      p_depth: depth,
    })
    if (error) {
      console.warn('[Fathom] failed to record echo:', error.message)
    }
  } catch (err) {
    console.warn('[Fathom] echo rpc threw:', err)
  }
}
