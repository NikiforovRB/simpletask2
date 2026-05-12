import { useDroppable } from '@dnd-kit/core';
import './DropSlot.css';

export function slotId(containerId, index) {
  return `slot::${containerId}::${index}`;
}

export function parseSlotId(overId) {
  if (typeof overId !== 'string' || !overId.startsWith('slot::')) return null;
  // The containerId may itself contain "::" (e.g. "gpday::2026-05-15"), so we
  // can't split on every "::". The index is always the suffix after the LAST
  // "::"; everything between the leading "slot::" and that last separator is
  // the containerId.
  const lastSep = overId.lastIndexOf('::');
  if (lastSep < 'slot::'.length) return null;
  const containerId = overId.slice('slot::'.length, lastSep);
  if (!containerId) return null;
  const idx = parseInt(overId.slice(lastSep + 2), 10);
  if (!Number.isFinite(idx)) return null;
  return { containerId, index: idx };
}

export function DropSlot({ id, index, children }) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId(id, index) });

  return (
    <div className="drop-slot__anchor" data-slot-index={index} data-container-id={id}>
      <div
        ref={setNodeRef}
        className={`drop-slot__hit ${isOver ? 'drop-slot__hit--over' : ''}`}
        data-slot-index={index}
        data-container-id={id}
      >
        <div className="drop-slot__line" aria-hidden />
      </div>
      {children}
    </div>
  );
}
