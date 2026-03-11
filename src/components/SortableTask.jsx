import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskItem } from './TaskItem';
import './DraggableTask.css';

export function SortableTask({ task, containerId, ...taskItemProps }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, containerId },
  });

  const style = isDragging
    ? { opacity: 0, transition }
    : { ...(transform ? { transform: CSS.Translate.toString(transform) } : {}), transition };

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
