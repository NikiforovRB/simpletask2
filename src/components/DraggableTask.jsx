import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TaskItem } from './TaskItem';
import './DraggableTask.css';

export function DraggableTask({ task, containerId, ...taskItemProps }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, containerId },
  });

  const slowTransition = 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)';
  const style = isDragging
    ? { opacity: 0 }
    : (transform ? { transform: CSS.Translate.toString(transform), transition: slowTransition } : undefined);

  const dragHandleProps = { attributes, listeners };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-task ${isDragging ? 'draggable-task--dragging' : ''}`}
    >
      <TaskItem task={task} dragHandleProps={dragHandleProps} {...taskItemProps} />
    </div>
  );
}
