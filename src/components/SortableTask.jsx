import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskItem } from './TaskItem';
import './DraggableTask.css';

export function SortableTask({ task, containerId, ...taskItemProps }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, containerId },
  });

  const slowTransition = transition
    ? transition.replace(/(\d+)ms/g, (_, ms) => `${Math.round(Number(ms) * 1.9)}ms`)
    : 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)';

  const style = isDragging
    ? { opacity: 0, transition: slowTransition }
    : { ...(transform ? { transform: CSS.Translate.toString(transform) } : {}), transition: slowTransition };

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
