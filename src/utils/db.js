import { openDB } from 'idb';

const DB_NAME = 'AiChatDatabase';
const CONVERSATIONS_STORE_NAME = 'conversations';
const IMAGES_STORE_NAME = 'images';
const DB_VERSION = 2;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE_NAME)) {
          db.createObjectStore(CONVERSATIONS_STORE_NAME, { keyPath: 'id' });
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(IMAGES_STORE_NAME)) {
          db.createObjectStore(IMAGES_STORE_NAME);
        }
      }
    },
  });
}

export async function getAllConversations() {
  const db = await getDB();
  return db.getAll(CONVERSATIONS_STORE_NAME);
}

export async function saveConversation(conversation) {
  const db = await getDB();
  return db.put(CONVERSATIONS_STORE_NAME, conversation);
}

export async function deleteConversation(id) {
  const db = await getDB();
  return db.delete(CONVERSATIONS_STORE_NAME, id);
}

// --- Image Store Functions ---

export async function saveImage(id, blob) {
  const db = await getDB();
  return db.put(IMAGES_STORE_NAME, blob, id);
}

export async function getImage(id) {
  const db = await getDB();
  return db.get(IMAGES_STORE_NAME, id);
}

export async function deleteImage(id) {
  const db = await getDB();
  return db.delete(IMAGES_STORE_NAME, id);
}
