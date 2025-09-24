import { openDB } from 'idb';

const DB_NAME = 'AiChatDatabase';
const CONVERSATIONS_STORE_NAME = 'conversations';
const IMAGES_STORE_NAME = 'images';
const PREFERENCES_STORE_NAME = 'preferences';
const DB_VERSION = 3;

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
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(PREFERENCES_STORE_NAME)) {
          db.createObjectStore(PREFERENCES_STORE_NAME);
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

// --- Preferences Store Functions ---

export async function saveLanguagePreference(language = 'English') {
  const db = await getDB();
  return db.put(PREFERENCES_STORE_NAME, language, 'selectedLanguage');
}

export async function getLanguagePreference() {
  const db = await getDB();
  const language = await db.get(PREFERENCES_STORE_NAME, 'selectedLanguage');
  return language || 'English'; // Default to English if not set
}

export async function savePreference(key, value) {
  const db = await getDB();
  return db.put(PREFERENCES_STORE_NAME, value, key);
}

export async function getPreference(key, defaultValue = null) {
  const db = await getDB();
  const value = await db.get(PREFERENCES_STORE_NAME, key);
  return value !== undefined ? value : defaultValue;
}

export async function deletePreference(key) {
  const db = await getDB();
  return db.delete(PREFERENCES_STORE_NAME, key);
}
