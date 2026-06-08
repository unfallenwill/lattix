import { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { ProgressBar } from '@inkjs/ui'
import type { Task } from '../types.js'
import { DIM, ACCENT, SUCCESS, WARNING, ERROR } from '../utils/colors.js'

interface StatsPanelProps {
  tasks: Task[]
  onBack: () => void
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ tasks, onBack }) => {
  const stats = useMemo(() => {
    if (tasks.length === 0) {
      return null
    }

    const statusCounts = {
      todo: tasks.filter((t) => t.status === 'todo').length,
      'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }

    const priorityCounts = {
      high: tasks.filter((t) => t.priority === 'high').length,
      medium: tasks.filter((t) => t.priority === 'medium').length,
      low: tasks.filter((t) => t.priority === 'low').length,
    }

    const completionPercent = Math.round((statusCounts.done / tasks.length) * 100)

    const lastUpdatedTask = tasks.reduce((latest, task) => {
      return new Date(task.updatedAt) > new Date(latest.updatedAt) ? task : latest
    }, tasks[0]!) // tasks[0] is safe here because tasks.length > 0

    return {
      total: tasks.length,
      statusCounts,
      priorityCounts,
      completionPercent,
      lastUpdatedTask,
    }
  }, [tasks])

  useInput((_input, key) => {
    if (key.escape) {
      onBack()
    }
  })

  if (!stats) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Task Statistics</Text>
        <Text>─────────────────</Text>
        <Text color={DIM}>No tasks yet. Press 'a' to add a task!</Text>
        <Text color={DIM}>Press Escape to go back.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Task Statistics</Text>
      <Text>─────────────────</Text>

      <Box gap={1}>
        <Text bold>Total:</Text>
        <Text>{stats.total} tasks</Text>
      </Box>

      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold>Status:</Text>
        <Box gap={2}>
          <Text>○ Todo: {stats.statusCounts.todo}</Text>
          <Text color={ACCENT}>◐ In Progress: {stats.statusCounts['in-progress']}</Text>
          <Text color={SUCCESS}>● Done: {stats.statusCounts.done}</Text>
        </Box>
        <ProgressBar value={stats.completionPercent} />
        <Text color={DIM}>Completion: {stats.completionPercent}%</Text>
      </Box>

      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold>Priority:</Text>
        <Box gap={2}>
          <Text color={ERROR}>▲ High: {stats.priorityCounts.high}</Text>
          <Text color={WARNING}>● Medium: {stats.priorityCounts.medium}</Text>
          <Text color={DIM}>▽ Low: {stats.priorityCounts.low}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold>Last Updated:</Text>
        <Text color={ACCENT}>{stats.lastUpdatedTask.title}</Text>
        <Text color={DIM}>
          Updated: {new Date(stats.lastUpdatedTask.updatedAt!).toLocaleString()}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={DIM}>Press Escape to go back.</Text>
      </Box>
    </Box>
  )
}
