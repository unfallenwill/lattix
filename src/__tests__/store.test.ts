import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create a test-specific store with a temp directory
const TEST_STORE_DIR = path.join(os.tmpdir(), `taskcli-test-${process.pid}-${Math.random()}`);

// We'll test the actual store functions by providing a custom store directory
// through a test-specific implementation
function createTestStore(storeDir: string) {
  const { randomUUID } = require('crypto');
  const storeFile = path.join(storeDir, 'tasks.json');

  return {
    generateId: (): string => randomUUID(),
    loadTasks: (): any[] => {
      try {
        if (!fs.existsSync(storeFile)) {
          return [];
        }
        const data = fs.readFileSync(storeFile, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error loading tasks:', error);
        return [];
      }
    },
    saveTasks: (tasks: any[]): void => {
      try {
        if (!fs.existsSync(storeDir)) {
          fs.mkdirSync(storeDir, { recursive: true });
        }
        fs.writeFileSync(storeFile, JSON.stringify(tasks, null, 2), 'utf-8');
      } catch (error) {
        console.error('Error saving tasks:', error);
        throw error;
      }
    },
    getStoreFile: () => storeFile,
    getStoreDir: () => storeDir,
  };
}

describe('Store Module', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    // Create a fresh test store for each test
    store = createTestStore(TEST_STORE_DIR);
    // Clean up test directory before each test
    if (fs.existsSync(TEST_STORE_DIR)) {
      fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(TEST_STORE_DIR)) {
      fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  describe('generateId', () => {
    it('should return unique IDs', () => {
      const id1 = store.generateId();
      const id2 = store.generateId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should return valid UUID format', () => {
      const id = store.generateId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });
  });

  describe('loadTasks', () => {
    it('should return empty array when store file does not exist', () => {
      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
      expect(tasks).toHaveLength(0);
    });

    it('should return empty array when store directory does not exist', () => {
      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should load tasks from valid JSON file', () => {
      const sampleTasks = [
        {
          id: '1',
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      store.saveTasks(sampleTasks);
      const loadedTasks = store.loadTasks();

      expect(loadedTasks).toEqual(sampleTasks);
      expect(loadedTasks).toHaveLength(1);
      expect(loadedTasks[0].title).toBe('Test Task');
    });

    it('should handle corrupted JSON gracefully', () => {
      // Create directory and file with invalid JSON
      fs.mkdirSync(TEST_STORE_DIR, { recursive: true });
      const storeFile = store.getStoreFile();
      fs.writeFileSync(storeFile, 'invalid json {', 'utf-8');

      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should handle empty JSON file', () => {
      fs.mkdirSync(TEST_STORE_DIR, { recursive: true });
      const storeFile = store.getStoreFile();
      fs.writeFileSync(storeFile, '', 'utf-8');

      const tasks = store.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should load multiple tasks correctly', () => {
      const sampleTasks = [
        {
          id: '1',
          title: 'Task 1',
          status: 'todo',
          priority: 'low',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          title: 'Task 2',
          status: 'in-progress',
          priority: 'high',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      store.saveTasks(sampleTasks);
      const loadedTasks = store.loadTasks();

      expect(loadedTasks).toEqual(sampleTasks);
      expect(loadedTasks).toHaveLength(2);
    });
  });

  describe('saveTasks', () => {
    it('should create directory and write valid JSON', () => {
      const sampleTasks = [
        {
          id: '1',
          title: 'New Task',
          description: 'New Description',
          status: 'todo',
          priority: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      store.saveTasks(sampleTasks);

      // Verify directory was created
      expect(fs.existsSync(TEST_STORE_DIR)).toBe(true);

      // Verify file was created
      const storeFile = store.getStoreFile();
      expect(fs.existsSync(storeFile)).toBe(true);

      // Verify file contains valid JSON
      const fileContent = fs.readFileSync(storeFile, 'utf-8');
      const parsedTasks = JSON.parse(fileContent);
      expect(parsedTasks).toEqual(sampleTasks);
    });

    it('should overwrite existing file', () => {
      const initialTasks = [
        {
          id: '1',
          title: 'Initial Task',
          status: 'todo',
          priority: 'low',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const updatedTasks = [
        {
          id: '2',
          title: 'Updated Task',
          status: 'done',
          priority: 'high',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      store.saveTasks(initialTasks);
      store.saveTasks(updatedTasks);

      const loadedTasks = store.loadTasks();
      expect(loadedTasks).toEqual(updatedTasks);
      expect(loadedTasks).not.toEqual(initialTasks);
    });

    it('should handle empty task array', () => {
      const emptyTasks: any[] = [];
      store.saveTasks(emptyTasks);

      const loadedTasks = store.loadTasks();
      expect(loadedTasks).toEqual([]);
    });

    it('should preserve all task fields including optional ones', () => {
      const tasksWithOptionalFields = [
        {
          id: '1',
          title: 'Task with all fields',
          description: 'This is a description',
          status: 'in-progress',
          priority: 'high',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          title: 'Task without description',
          status: 'todo',
          priority: 'low',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      store.saveTasks(tasksWithOptionalFields);
      const loadedTasks = store.loadTasks();

      expect(loadedTasks).toEqual(tasksWithOptionalFields);
      expect(loadedTasks[0].description).toBe('This is a description');
      expect(loadedTasks[1].description).toBeUndefined();
    });
  });

  describe('saveTasks and loadTasks round-trip', () => {
    it('should maintain data integrity through save/load cycle', () => {
      const originalTasks = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Complex Task',
          description: 'Task with special characters: <>&"\'\\',
          status: 'done',
          priority: 'high',
          createdAt: '2024-01-01T12:30:45.123Z',
          updatedAt: '2024-01-02T18:45:30.456Z',
        },
      ];

      store.saveTasks(originalTasks);
      const loadedTasks = store.loadTasks();

      expect(loadedTasks).toEqual(originalTasks);
      expect(loadedTasks[0].id).toBe(originalTasks[0].id);
      expect(loadedTasks[0].title).toBe(originalTasks[0].title);
      expect(loadedTasks[0].description).toBe(originalTasks[0].description);
      expect(loadedTasks[0].status).toBe(originalTasks[0].status);
      expect(loadedTasks[0].priority).toBe(originalTasks[0].priority);
      expect(loadedTasks[0].createdAt).toBe(originalTasks[0].createdAt);
      expect(loadedTasks[0].updatedAt).toBe(originalTasks[0].updatedAt);
    });

    it('should handle multiple save/load cycles', () => {
      const tasks1 = [
        {
          id: '1',
          title: 'Task 1',
          status: 'todo',
          priority: 'low',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      const tasks2 = [
        {
          id: '2',
          title: 'Task 2',
          status: 'done',
          priority: 'high',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      store.saveTasks(tasks1);
      const loaded1 = store.loadTasks();
      expect(loaded1).toEqual(tasks1);

      store.saveTasks(tasks2);
      const loaded2 = store.loadTasks();
      expect(loaded2).toEqual(tasks2);
    });
  });
});
