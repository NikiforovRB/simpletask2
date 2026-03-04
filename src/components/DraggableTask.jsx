import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TaskItem } from './TaskItem';
import './DraggableTask.css';

export function DraggableTask({ task, containerId, ...taskItemProps }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, containerId },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

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
