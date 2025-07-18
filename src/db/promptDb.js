import Dexie from 'dexie';

export const db = new Dexie('promptsDatabase');
db.version(2).stores({
  prompts: '++id, title, command, prompt',
});

export const addPrompt = async ({ title, command, prompt }) => {
  try {
    if (!title || !command || !prompt) {
      throw new Error('Title, command, and prompt are required');
    }
    return await db.prompts.add({ title, command, prompt });
  } catch (error) {
    console.error('Error adding prompt:', error);
    throw error;
  }
};

export const getAllPrompts = async () => {
  return await db.prompts.toArray();
};

export const updatePrompt = async (id, { title, command, prompt }) => {
  try {
    if (!id || (!title && !command && !prompt)) {
      throw new Error('ID and at least one field to update are required');
    }
    return await db.prompts.update(id, { title, command, prompt });
  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
};

export const deletePrompt = async (id) => {
  try {
    if (!id) {
      throw new Error('ID is required for deletion');
    }
    return await db.prompts.delete(id);
  } catch (error) {
    console.error('Error deleting prompt:', error);
    throw error;
  }
};
