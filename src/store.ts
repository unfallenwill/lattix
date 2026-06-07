import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Task } from './types';

const STORE_DIR = path.join(os.homedir(), '.taskcli');
const STORE_FILE = path.join(STORE_DIR, 'tasks.json');

export function generateId(): string {
  return randomUUID();
}

export function loadTasks(): Task[] {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return [];
    }
    const data = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(data) as Task[];
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving tasks:', error);
    throw error;
  }
}
