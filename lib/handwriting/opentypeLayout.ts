'use client'

import * as opentype from 'opentype.js'

export type RawStroke = {
  id: string
  char: string
  lineIndex: number
  glyphIndex: number
  strokeIndex: number
  totalStrokesInGlyph: number
  isLastStrokeInGlyph: boolean
  endOfLine: boolean
  isWhitespace: boolean
  advance: number
  x: number
  baselineY: number
  d: string
  complexity: number
}

export type HandwrittenLayout = {
  width: number
  height: number
  ascent: number
  descent: number
  lineAdvance: number
  strokes: RawStroke[]
}

export type BuildLayoutOptions = {
  text: string
  font: opentype.Font
  fontSize: number
  lineHeight?: number
  letterSpacing?: number
  paddingX?: number
  paddingY?: number
}

function fmt(n: number, precision = 2) {
  return Number(n.toFixed(precision)).toString()
}

function commandToD(cmd: opentype.PathCommand, precision = 2) {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return `${cmd.type}${fmt(cmd.x, precision)} ${fmt(cmd.y, precision)}`
    case 'Q':
      return `Q${fmt(cmd.x1!, precision)} ${fmt(cmd.y1!, precision)} ${fmt(cmd.x, precision)} ${fmt(cmd.y, precision)}`
    case 'C':
      return `C${fmt(cmd.x1!, precision)} ${fmt(cmd.y1!, precision)} ${fmt(cmd.x2!, precision)} ${fmt(cmd.y2!, precision)} ${fmt(cmd.x, precision)} ${fmt(cmd.y, precision)}`
    case 'Z':
      return 'Z'
    default:
      return ''
  }
}

function splitCommandsIntoSubpaths(commands: opentype.PathCommand[]) {
  const groups: opentype.PathCommand[][] = []
  let current: opentype.PathCommand[] = []

  for (const cmd of commands) {
    if (cmd.type === 'M' && current.length > 0) {
      groups.push(current)
      current = [cmd]
    } else {
      current.push(cmd)
    }
  }

  if (current.length > 0) groups.push(current)

  return groups
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length > 0)
}

function commandsToD(commands: opentype.PathCommand[]) {
  return commands.map((cmd) => commandToD(cmd)).join(' ')
}

export async function loadOpenTypeFont(fontUrl: string) {
  const res = await fetch(fontUrl)
  if (!res.ok) {
    throw new Error(`Failed to load font: ${fontUrl}`)
  }
  const buffer = await res.arrayBuffer()
  return opentype.parse(buffer)
}

export function buildHandwrittenLayout({
  text,
  font,
  fontSize,
  lineHeight,
  letterSpacing = 0,
  paddingX = 12,
  paddingY = 12,
}: BuildLayoutOptions): HandwrittenLayout {
  const scale = fontSize / font.unitsPerEm
  const ascent = font.ascender * scale
  const descent = Math.abs(font.descender * scale)
  const lineAdvance = lineHeight ?? (ascent + descent) * 1.45

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const strokes: RawStroke[] = []

  let maxLineWidth = 0
  let globalGlyphIndex = 0

  lines.forEach((line, lineIndex) => {
    let penX = paddingX
    const baselineY = paddingY + ascent + lineIndex * lineAdvance
    let prevGlyph: opentype.Glyph | null = null

    const glyphs = font.stringToGlyphs(line)
    const chars = Array.from(line)

    glyphs.forEach((glyph, localGlyphIndex) => {
      const char = chars[localGlyphIndex] ?? ''
      const isWhitespace = /\s/.test(char) || glyph.unicode === 32

      const kerning = prevGlyph ? font.getKerningValue(prevGlyph, glyph) * scale : 0
      penX += kerning

      const advance = (glyph.advanceWidth || font.unitsPerEm * 0.5) * scale

      if (isWhitespace) {
        strokes.push({
          id: `space-${lineIndex}-${globalGlyphIndex}`,
          char,
          lineIndex,
          glyphIndex: globalGlyphIndex,
          strokeIndex: 0,
          totalStrokesInGlyph: 0,
          isLastStrokeInGlyph: true,
          endOfLine: localGlyphIndex === glyphs.length - 1,
          isWhitespace: true,
          advance,
          x: penX,
          baselineY,
          d: '',
          complexity: 0,
        })
        penX += advance + letterSpacing
        prevGlyph = glyph
        globalGlyphIndex++
        return
      }

      const glyphPath = glyph.getPath(penX, baselineY, fontSize)
      const groups = splitCommandsIntoSubpaths(glyphPath.commands)
      const ds = groups.map(commandsToD).filter(Boolean)

      ds.forEach((d, strokeIndex) => {
        strokes.push({
          id: `glyph-${lineIndex}-${globalGlyphIndex}-stroke-${strokeIndex}`,
          char,
          lineIndex,
          glyphIndex: globalGlyphIndex,
          strokeIndex,
          totalStrokesInGlyph: ds.length,
          isLastStrokeInGlyph: strokeIndex === ds.length - 1,
          endOfLine: localGlyphIndex === glyphs.length - 1,
          isWhitespace: false,
          advance,
          x: penX,
          baselineY,
          d,
          complexity: groups[strokeIndex]?.length ?? 1,
        })
      })

      penX += advance + letterSpacing
      prevGlyph = glyph
      globalGlyphIndex++
    })

    maxLineWidth = Math.max(maxLineWidth, penX)
  })

  const width = Math.max(1, maxLineWidth + paddingX)
  const height = Math.max(1, paddingY * 2 + ascent + descent + (lines.length - 1) * lineAdvance)

  return {
    width,
    height,
    ascent,
    descent,
    lineAdvance,
    strokes,
  }
}
