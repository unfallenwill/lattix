import { Box, Text } from 'ink'
import type { Task } from '../types.js'
import {
  ACCENT,
  DIM,
  statusColor,
  statusLabel,
  priorityColor,
  priorityLabel,
} from '../utils/colors.js'

interface TaskItemProps {
  task: Task
  selected?: boolean
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, selected }) => {
  const shortId = task.id.substring(0, 8)
  const truncatedTitle = task.title.length > 30 ? task.title.substring(0, 27) + '…' : task.title
  const updatedDate = new Date(task.updatedAt).toISOString().split('T')[0]

  return (
    <Box gap={1}>
      <Text color={selected ? ACCENT : undefined}>{selected ? '▶ ' : '  '}</Text>
      <Text color={DIM}>{shortId}</Text>
      <Text color={statusColor(task.status)}>{statusLabel(task.status)}</Text>
      <Text color={priorityColor(task.priority)}>{priorityLabel(task.priority)}</Text>
      <Text>{truncatedTitle}</Text>
      <Text color={DIM}>{updatedDate}</Text>
    </Box>
  )
}
