import { useDroppable } from '@dnd-kit/core';
import './DropSlot.css';

export function slotId(containerId, index) {
  return `slot::${containerId}::${index}`;
}

export function parseSlotId(overId) {
  if (typeof overId !== 'string' || !overId.startsWith('slot::')) return null;
  const parts = overId.split('::');
  if (parts.length !== 3) return null;
  return { containerId: parts[1], index: parseInt(parts[2], 10) };
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
