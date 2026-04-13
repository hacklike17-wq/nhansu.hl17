/**
 * Drag-and-drop reorder hook for salary columns.
 * Extracted from caidat/page.tsx — logic unchanged.
 *
 * Persists the new order via PATCH /api/salary-columns/:id (order field only),
 * never touching formula/calcMode/type/etc.
 */
import { useState, useRef } from 'react'
import type React from 'react'

type ColumnLike = { id: string; order: number }

export function useColumnDragSort<T extends ColumnLike>(
  columns: T[],
  onPersisted: () => void | Promise<any>,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // Stable refs so drop handler reads current values without stale closure
  const draggingIdRef = useRef<string | null>(null)
  const dragOverIdRef = useRef<string | null>(null)

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    draggingIdRef.current = id
    // Delay so browser captures the full-opacity snapshot before hiding
    setTimeout(() => setDraggingId(id), 0)
  }

  function handleDragEnter(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id === draggingIdRef.current) return
    dragOverIdRef.current = id
    setDragOverId(id)
  }

  // Must preventDefault to allow drop — but do NOT update dragOverId here (fires 60fps)
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function resetDragState() {
    setDraggingId(null)
    setDragOverId(null)
    draggingIdRef.current = null
    dragOverIdRef.current = null
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const from = draggingIdRef.current
    const to = dragOverIdRef.current
    resetDragState()
    if (!from || !to || from === to) return

    const sorted = [...columns].sort((a, b) => a.order - b.order)
    const fromIdx = sorted.findIndex(c => c.id === from)
    const toIdx = sorted.findIndex(c => c.id === to)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...sorted]
    const [item] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, item)
    const updates = reordered.map((c, i) => ({ id: c.id, order: i }))

    // Persist new order — only send order field, never touches formula/calcMode
    Promise.all(
      updates.map(u =>
        fetch(`/api/salary-columns/${u.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: u.order }),
        })
      )
    ).then(() => onPersisted()).catch(() => onPersisted())
  }

  function handleDragEnd() {
    resetDragState()
  }

  return {
    draggingId,
    dragOverId,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  }
}
