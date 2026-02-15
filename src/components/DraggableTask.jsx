import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { TaskItem } from './TaskItem';
import './DraggableTask.css';

export function DraggableTask({ task, containerId, ...taskItemProps }) {
  const isWide = useMediaQuery('(min-width: 501px)');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, containerId },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), transition: 'transform 0.2s ease' }
    : undefined;

  const dragHandleProps = isWide ? undefined : { attributes, listeners };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-task ${isDragging ? 'draggable-task--dragging' : ''}`}
      {...(isWide ? { ...attributes, ...listeners } : {})}
    >
      <TaskItem task={task} dragHandleProps={dragHandleProps} {...taskItemProps} />
    </div>
  );
}
