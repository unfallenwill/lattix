// Color constants for Ink Text component
// Ink accepts color names (supported by chalk) as strings

export const statusColor = (status: string): string => {
  switch (status) {
    case 'todo':
      return 'yellow'
    case 'in-progress':
      return 'blue'
    case 'done':
      return 'green'
    default:
      return 'white'
  }
}

export const priorityColor = (priority: string): string => {
  switch (priority) {
    case 'high':
      return 'red'
    case 'medium':
      return 'yellow'
    case 'low':
      return 'gray'
    default:
      return 'white'
  }
}

export const statusLabel = (status: string): string => {
  switch (status) {
    case 'todo':
      return '○ Todo'
    case 'in-progress':
      return '◐ In Progress'
    case 'done':
      return '● Done'
    default:
      return status
  }
}

export const priorityLabel = (priority: string): string => {
  switch (priority) {
    case 'high':
      return '▲ High'
    case 'medium':
      return '● Medium'
    case 'low':
      return '▽ Low'
    default:
      return priority
  }
}

// Color constants for direct use in Ink components
export const BRAND = 'cyan'
export const DIM = 'gray'
export const ACCENT = 'cyan'
export const SUCCESS = 'green'
export const ERROR = 'red'
export const WARNING = 'yellow'
