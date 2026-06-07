# TaskCLI

A beautiful CLI task manager for managing your tasks from the command line.

## Features

- **Add tasks** - Create new tasks with titles, descriptions, priorities, and tags
- **List tasks** - View all tasks or filter by status with sorting options
- **Update tasks** - Modify existing task properties
- **Delete tasks** - Remove tasks by ID
- **Search tasks** - Find tasks by keyword across title and description
- **Statistics** - View task statistics by status and priority
- **Interactive mode** - Interactive terminal interface for task management

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Add a task
```bash
taskcli add -t "My task title" -d "Task description" -p high --tags work,urgent
```

### List tasks
```bash
# List all tasks
taskcli list

# List only completed tasks
taskcli list -s done

# List tasks with high priority
taskcli list -p high
```

### Update a task
```bash
# Mark task as done
taskcli update <id> -s done

# Update task title and priority
taskcli update <id> -t "New title" -p medium
```

### Delete a task
```bash
taskcli delete <id>
```

### Search tasks
```bash
taskcli search "keyword"
```

### View statistics
```bash
taskcli stats
```

### Interactive mode
```bash
taskcli interactive
```

## Development

```bash
# Run in development mode (ts-node)
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Start the built CLI
npm start
```

## License

MIT
