import { useRef, useEffect } from 'react'
import { Tldraw, InstancePresenceRecordType, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

interface CursorConfig {
  targetX: number
  targetY: number
}

// Cursor colors
const CURSOR_COLORS = ['#0066FF', '#5D00FF', '#2FFF00', '#FFD700'] // blue, phantom, neon, yellow

// Get cursor configs for the hero section
function getHeroCursorConfigs(containerWidth: number, containerHeight: number): CursorConfig[] {
  const centerX = containerWidth / 2
  const heroContentWidth = Math.min(600, containerWidth * 0.7)
  const margin = Math.max(50, containerWidth * 0.05)
  const leftEdge = centerX - heroContentWidth / 2 - margin
  const rightEdge = centerX + heroContentWidth / 2 + margin

  const clampX = (x: number) => Math.max(30, Math.min(containerWidth - 30, x))
  const clampY = (y: number) => Math.max(30, Math.min(containerHeight - 30, y))

  return [
    // Top left - blue
    { targetX: clampX(leftEdge - 30), targetY: clampY(containerHeight * 0.25) },
    // Bottom left - purple
    { targetX: clampX(centerX - 200), targetY: clampY(containerHeight * 0.55) },
    // Top right - orange
    { targetX: clampX(rightEdge + 30), targetY: clampY(containerHeight * 0.3) },
    // Bottom right - yellow
    { targetX: clampX(centerX + 200), targetY: clampY(containerHeight * 0.6) },
  ]
}

// Linear interpolation helper
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

// Calculate floating cursor position
function calculatePosition(
  config: CursorConfig,
  time: number,
  index: number
): { x: number; y: number } {
  const { targetX, targetY } = config
  // Very subtle idle movement
  const phaseOffset = index * 0.7
  const x = targetX + Math.sin((time * 0.2 + phaseOffset) * Math.PI * 2) * 5
  const y = targetY + Math.cos((time * 0.15 + phaseOffset) * Math.PI * 2) * 4
  return { x, y }
}

export function CursorOverlay() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(-1)
  const editorRef = useRef<Editor | null>(null)
  const presencesRef = useRef<ReturnType<typeof InstancePresenceRecordType.create>[]>([])
  const containerSizeRef = useRef({ width: 800, height: 600 })

  // Initialize positions
  const getInitialPositions = () => {
    const configs = getHeroCursorConfigs(800, 600)
    return configs.map(c => ({ x: c.targetX, y: c.targetY }))
  }
  const currentPositionsRef = useRef<{ x: number; y: number }[]>(getInitialPositions())

  // Track container size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      containerSizeRef.current = { width: rect.width, height: rect.height }
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current !== -1) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="tldraw-cursor-overlay absolute inset-0 z-50 pointer-events-none [&_.tl-collaborator__cursor]:scale-[3] [&_.tl-collaborator__cursor]:origin-top-left [&_.tl-cursor-label]:text-base [&_.tl-cursor-label]:px-3 [&_.tl-cursor-label]:py-1.5"
    >
      <Tldraw
        hideUi
        licenseKey='tldraw-2026-04-17/WyJJRWtfa0dISCIsWyIqIl0sMTYsIjIwMjYtMDQtMTciXQ.j8grHi4C1XmlidMZWLONW55aQNBjjH6IhdmzAfAy0HgHjuoFKNgOinZHmeAS11QwJrkCn4ffZAOAyjM7sISwSA'
        onMount={(editor) => {
          editorRef.current = editor

          // Create presence records for each cursor
          presencesRef.current = CURSOR_COLORS.map((color, index) => {
            return InstancePresenceRecordType.create({
              id: InstancePresenceRecordType.createId(`user-${index}`),
              currentPageId: editor.getCurrentPageId(),
              userId: `user-${index}`,
              userName: '',
              color: color,
              cursor: { x: 300 + index * 100, y: 250 + index * 50, type: 'default', rotation: 0 },
              chatMessage: '',
            })
          })

          // Add all presences to the store
          editor.store.mergeRemoteChanges(() => {
            editor.store.put(presencesRef.current)
          })

          // Animation loop
          function loop() {
            const now = Date.now()
            const time = now / 1000
            const { width, height } = containerSizeRef.current
            const configs = getHeroCursorConfigs(width, height)

            const updatedPresences = presencesRef.current.map((presence, index) => {
              const config = configs[index]
              const targetPos = calculatePosition(config, time, index)

              // Smooth interpolation toward target position
              const currentPos = currentPositionsRef.current[index]
              const lerpFactor = 0.08
              const newX = lerp(currentPos.x, targetPos.x, lerpFactor)
              const newY = lerp(currentPos.y, targetPos.y, lerpFactor)

              currentPositionsRef.current[index] = { x: newX, y: newY }

              return {
                ...presence,
                cursor: { x: newX, y: newY, type: 'default' as const, rotation: 0 },
                lastActivityTimestamp: now,
              }
            })

            editor.store.mergeRemoteChanges(() => {
              editor.store.put(updatedPresences)
            })

            rafRef.current = editor.timers.requestAnimationFrame(loop)
          }

          rafRef.current = editor.timers.requestAnimationFrame(loop)
        }}
      />
    </div>
  )
}
