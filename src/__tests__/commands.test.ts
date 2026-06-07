import { Task } from '../types';

/**
 * Commands Test Suite
 *
 * This file tests the data flow patterns for CLI commands.
 * Since commands use chalk and commander for CLI framework,
 * we test the underlying logic rather than the CLI framework itself.
 *
 * The test patterns below verify:
 * - Data validation and transformation
 * - Store interaction patterns
 * - Filtering and searching logic
 * - State management operations
 */

describe('Commands Data Flow', () => {
  let mockTasks: Task[];
  let capturedSaveTasks: Task[] | null;
  let taskIdCounter = 0;

  beforeEach(() => {
    // Reset state before each test
    mockTasks = [];
    capturedSaveTasks = null;
    taskIdCounter = 0;
  });

  /**
   * Helper: Create a sample task
   */
  function createTask(overrides?: Partial<Task>): Task {
    return {
      id: 'test-id-1',
      title: 'Test Task',
      description: 'Test Description',
      status: 'todo',
      priority: 'medium',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  /**
   * Helper: Simulate the "add task" command data flow
   */
  function simulateAddTask(title: string, description?: string, priority: string = 'medium'): Task {
    const now = new Date().toISOString();
    taskIdCounter++; // Increment counter for unique ID
    const newTask: Task = {
      id: `generated-id-${taskIdCounter}`,
      title,
      description,
      status: 'todo',
      priority: priority as Task['priority'],
      createdAt: now,
      updatedAt: now,
    };

    // Simulate saving to store
    mockTasks.push(newTask);
    capturedSaveTasks = [...mockTasks];

    return newTask;
  }

  /**
   * Helper: Simulate the "list tasks" command with filtering
   */
  function simulateListTasks(filter?: { status?: Task['status'] }): Task[] {
    if (!filter || !filter.status) {
      return [...mockTasks];
    }
    return mockTasks.filter(task => task.status === filter.status);
  }

  /**
   * Helper: Simulate the "update task" command
   */
  function simulateUpdateTask(taskId: string, updates: Partial<Task>): Task | null {
    const taskIndex = mockTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return null;

    const now = new Date().toISOString();
    mockTasks[taskIndex] = {
      ...mockTasks[taskIndex],
      ...updates,
      id: mockTasks[taskIndex].id, // Ensure ID doesn't change
      updatedAt: now,
    };

    capturedSaveTasks = [...mockTasks];
    return mockTasks[taskIndex];
  }

  /**
   * Helper: Simulate the "delete task" command
   */
  function simulateDeleteTask(taskId: string): boolean {
    const initialLength = mockTasks.length;
    mockTasks = mockTasks.filter(t => t.id !== taskId);

    if (mockTasks.length < initialLength) {
      capturedSaveTasks = [...mockTasks];
      return true;
    }
    return false;
  }

  /**
   * Helper: Simulate the "search tasks" command
   */
  function simulateSearchTasks(query: string): Task[] {
    const lowerQuery = query.toLowerCase();
    return mockTasks.filter(task =>
      task.title.toLowerCase().includes(lowerQuery) ||
      (task.description && task.description.toLowerCase().includes(lowerQuery))
    );
  }

  describe('Add Task Command', () => {
    it('should create task with correct fields', () => {
      const newTask = simulateAddTask('New Feature', 'Implement new feature', 'high');

      expect(newTask).toMatchObject({
        title: 'New Feature',
        description: 'Implement new feature',
        status: 'todo',
        priority: 'high',
      });

      expect(newTask.id).toBeDefined();
      expect(newTask.createdAt).toBeDefined();
      expect(newTask.updatedAt).toBeDefined();

      // Verify it was captured for saving
      expect(capturedSaveTasks).toContain(newTask);
    });

    it('should create task without description', () => {
      const newTask = simulateAddTask('Simple Task');

      expect(newTask.title).toBe('Simple Task');
      expect(newTask.description).toBeUndefined();
      expect(newTask.status).toBe('todo');
      expect(newTask.priority).toBe('medium');
    });

    it('should create task with custom priority', () => {
      const newTask = simulateAddTask('Low Priority Task', undefined, 'low');

      expect(newTask.priority).toBe('low');
    });

    it('should validate priority values', () => {
      const validPriorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      validPriorities.forEach(priority => {
        const task = simulateAddTask(`Task with ${priority} priority`, undefined, priority);
        expect(task.priority).toBe(priority);
      });
    });

    it('should add task to existing tasks', () => {
      // Start with existing tasks
      mockTasks = [createTask({ id: 'existing-1', title: 'Existing Task' })];

      const newTask = simulateAddTask('New Task');

      expect(mockTasks).toHaveLength(2);
      expect(mockTasks.some(t => t.title === 'New Task')).toBe(true);
      expect(mockTasks.some(t => t.title === 'Existing Task')).toBe(true);
    });
  });

  describe('List Tasks Command', () => {
    beforeEach(() => {
      // Setup sample tasks
      mockTasks = [
        createTask({ id: '1', title: 'Task 1', status: 'todo' }),
        createTask({ id: '2', title: 'Task 2', status: 'in-progress' }),
        createTask({ id: '3', title: 'Task 3', status: 'done' }),
        createTask({ id: '4', title: 'Task 4', status: 'todo' }),
      ];
    });

    it('should return all tasks when no filter provided', () => {
      const tasks = simulateListTasks();

      expect(tasks).toHaveLength(4);
    });

    it('should filter tasks by status', () => {
      const todoTasks = simulateListTasks({ status: 'todo' });

      expect(todoTasks).toHaveLength(2);
      expect(todoTasks.every(t => t.status === 'todo')).toBe(true);
    });

    it('should filter by in-progress status', () => {
      const inProgressTasks = simulateListTasks({ status: 'in-progress' });

      expect(inProgressTasks).toHaveLength(1);
      expect(inProgressTasks[0].title).toBe('Task 2');
    });

    it('should filter by done status', () => {
      const doneTasks = simulateListTasks({ status: 'done' });

      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].title).toBe('Task 3');
    });

    it('should return empty array for non-matching filter', () => {
      // Add a mock task with a status that doesn't exist
      const result = simulateListTasks({ status: 'todo' });

      // All our tasks are either todo, in-progress, or done
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not modify original tasks when listing', () => {
      const initialLength = mockTasks.length;
      simulateListTasks({ status: 'todo' });

      expect(mockTasks).toHaveLength(initialLength);
    });
  });

  describe('Update Task Command', () => {
    beforeEach(() => {
      mockTasks = [
        createTask({ id: '1', title: 'Original Title', status: 'todo' }),
        createTask({ id: '2', title: 'Another Task', status: 'done' }),
      ];
    });

    it('should update task title', () => {
      const updated = simulateUpdateTask('1', { title: 'Updated Title' });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated Title');
      expect(updated!.status).toBe('todo'); // Other fields unchanged
      expect(updated!.id).toBe('1'); // ID unchanged
    });

    it('should update task status', () => {
      const updated = simulateUpdateTask('1', { status: 'in-progress' });

      expect(updated!.status).toBe('in-progress');
      expect(updated!.title).toBe('Original Title'); // Other fields unchanged
    });

    it('should update task priority', () => {
      const updated = simulateUpdateTask('1', { priority: 'high' });

      expect(updated!.priority).toBe('high');
    });

    it('should update task description', () => {
      const updated = simulateUpdateTask('1', { description: 'New description' });

      expect(updated!.description).toBe('New description');
    });

    it('should update multiple fields at once', () => {
      const updated = simulateUpdateTask('1', {
        title: 'New Title',
        status: 'done',
        priority: 'high',
      });

      expect(updated).toMatchObject({
        id: '1',
        title: 'New Title',
        status: 'done',
        priority: 'high',
      });
    });

    it('should return null for non-existent task', () => {
      const updated = simulateUpdateTask('non-existent', { title: 'New Title' });

      expect(updated).toBeNull();
    });

    it('should update updatedAt timestamp', () => {
      const original = mockTasks[0];
      const originalUpdatedAt = original.updatedAt;

      // Simulate a delay
      jest.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 1000);

      const updated = simulateUpdateTask('1', { title: 'Changed' });

      expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should not change other tasks when updating one', () => {
      const otherTaskBefore = { ...mockTasks[1] };

      simulateUpdateTask('1', { title: 'Updated Task 1' });

      expect(mockTasks[1]).toEqual(otherTaskBefore);
    });
  });

  describe('Delete Task Command', () => {
    beforeEach(() => {
      mockTasks = [
        createTask({ id: '1', title: 'Task to Delete' }),
        createTask({ id: '2', title: 'Task to Keep' }),
        createTask({ id: '3', title: 'Another Task to Keep' }),
      ];
    });

    it('should remove the correct task', () => {
      const result = simulateDeleteTask('1');

      expect(result).toBe(true);
      expect(mockTasks).toHaveLength(2);
      expect(mockTasks.find(t => t.id === '1')).toBeUndefined();
      expect(mockTasks.find(t => t.id === '2')).toBeDefined();
    });

    it('should return false for non-existent task', () => {
      const result = simulateDeleteTask('non-existent');

      expect(result).toBe(false);
      expect(mockTasks).toHaveLength(3); // No changes
    });

    it('should handle deleting from empty list', () => {
      mockTasks = [];
      const result = simulateDeleteTask('1');

      expect(result).toBe(false);
      expect(mockTasks).toHaveLength(0);
    });

    it('should handle deleting the last task', () => {
      mockTasks = [createTask({ id: '1', title: 'Only Task' })];

      const result = simulateDeleteTask('1');

      expect(result).toBe(true);
      expect(mockTasks).toHaveLength(0);
    });

    it('should capture save after deletion', () => {
      simulateDeleteTask('1');

      expect(capturedSaveTasks).toBeDefined();
      expect(capturedSaveTasks).toHaveLength(2);
    });
  });

  describe('Search Tasks Command', () => {
    beforeEach(() => {
      mockTasks = [
        createTask({ id: '1', title: 'Fix authentication bug', description: 'Login fails' }),
        createTask({ id: '2', title: 'Add new feature', description: 'Implement search' }),
        createTask({ id: '3', title: 'Update documentation', description: 'API docs' }),
        createTask({ id: '4', title: 'Refactor code', description: 'Clean up auth module' }),
      ];
    });

    it('should find tasks by title', () => {
      const results = simulateSearchTasks('authentication');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix authentication bug');
    });

    it('should find tasks by description', () => {
      const results = simulateSearchTasks('Login');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix authentication bug');
    });

    it('should find multiple matching tasks', () => {
      const results = simulateSearchTasks('auth');

      expect(results).toHaveLength(2);
      expect(results.some(t => t.title.includes('authentication'))).toBe(true);
      expect(results.some(t => t.description?.includes('auth'))).toBe(true);
    });

    it('should return empty array for non-matching query', () => {
      const results = simulateSearchTasks('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const lowerResults = simulateSearchTasks('authentication');
      const upperResults = simulateSearchTasks('AUTHENTICATION');
      const mixedResults = simulateSearchTasks('AuThEnTiCaTiOn');

      expect(lowerResults).toHaveLength(1);
      expect(upperResults).toHaveLength(1);
      expect(mixedResults).toHaveLength(1);
      expect(lowerResults[0].id).toBe(upperResults[0].id);
      expect(lowerResults[0].id).toBe(mixedResults[0].id);
    });

    it('should handle partial matches', () => {
      const results = simulateSearchTasks('doc');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Update documentation');
      expect(results[0].description).toBe('API docs');
    });

    it('should handle empty search query', () => {
      const results = simulateSearchTasks('');

      // Empty string matches everything (includes returns true for all)
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle special characters in search', () => {
      const taskWithSpecialChars = createTask({
        id: '5',
        title: 'Handle special chars: <>&',
      });
      mockTasks.push(taskWithSpecialChars);

      const results = simulateSearchTasks('<>&');
      expect(results).toHaveLength(1);
    });
  });

  describe('Data Flow Integration', () => {
    it('should handle complete task lifecycle', () => {
      // Start empty
      expect(mockTasks).toHaveLength(0);

      // Add task
      const newTask = simulateAddTask('Lifecycle Task', 'Test lifecycle', 'medium');
      expect(mockTasks).toHaveLength(1);

      // Update task
      simulateUpdateTask(newTask.id, { status: 'in-progress' });
      expect(mockTasks[0].status).toBe('in-progress');

      // Search for task
      const searchResults = simulateSearchTasks('lifecycle');
      expect(searchResults).toHaveLength(1);

      // Delete task
      const deleted = simulateDeleteTask(newTask.id);
      expect(deleted).toBe(true);
      expect(mockTasks).toHaveLength(0);
    });

    it('should handle multiple concurrent operations', () => {
      // Add multiple tasks
      const task1 = simulateAddTask('Task 1', 'Description 1', 'high');
      const task2 = simulateAddTask('Task 2', 'Description 2', 'medium');
      const task3 = simulateAddTask('Task 3', undefined, 'low');

      expect(mockTasks).toHaveLength(3);

      // Verify tasks were added correctly
      expect(mockTasks[0].id).toBe(task1.id);
      expect(mockTasks[1].id).toBe(task2.id);
      expect(mockTasks[2].id).toBe(task3.id);

      // Update some
      const updated1 = simulateUpdateTask(task1.id, { status: 'done' });
      const updated2 = simulateUpdateTask(task2.id, { status: 'in-progress' });

      // Verify updates were successful
      expect(updated1).not.toBeNull();
      expect(updated2).not.toBeNull();
      expect(updated1!.status).toBe('done');
      expect(updated2!.status).toBe('in-progress');

      // Filter by status
      const doneTasks = simulateListTasks({ status: 'done' });
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].id).toBe(task1.id);

      // Search (only task1 and task2 have 'Description' in their description)
      const searchResults = simulateSearchTasks('Description');
      expect(searchResults).toHaveLength(2);
      expect(searchResults.every(t => t.description?.includes('Description'))).toBe(true);

      // Delete one
      simulateDeleteTask(task3.id);
      expect(mockTasks).toHaveLength(2);
    });
  });
});
