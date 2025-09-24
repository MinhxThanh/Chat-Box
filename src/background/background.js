// This background script manages the side panel

import { openDB } from 'idb';

const DB_NAME = 'AiChatDatabase';
const PREFERENCES_STORE_NAME = 'preferences';
const DB_VERSION = 3;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PREFERENCES_STORE_NAME)) {
        db.createObjectStore(PREFERENCES_STORE_NAME);
      }
    },
  });
}

async function idbGetPreference(key, defaultValue = null) {
  const db = await getDB();
  const v = await db.get(PREFERENCES_STORE_NAME, key);
  return v !== undefined ? v : defaultValue;
}

async function idbSetPreference(key, value) {
  const db = await getDB();
  await db.put(PREFERENCES_STORE_NAME, value, key);
}

async function idbDeletePreference(key) {
  const db = await getDB();
  await db.delete(PREFERENCES_STORE_NAME, key);
}

// Cross-browser API wrapper
const api = typeof browser !== 'undefined' ? browser : chrome;

// Track active tab and sidebar state
let activeTabId = null;          // updated on every tab switch
let sidebarOpen = false;       // global toggle

// Keep track of active tab
api.tabs.onActivated.addListener(({tabId}) => activeTabId = tabId);
api.tabs.onRemoved.addListener(id => { 
  if (id === activeTabId) activeTabId = null; 
});

// Track sidebar open state
let activeSidebarTabId = null;

// Configure the side panel behavior - allow action click to open (Chrome only)
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  try {
    api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    // Ignore if not supported
    console.error(error);
  }
}

// Register a command shortcut for toggling the sidebar
api.commands.onCommand.addListener(command => {
  if (command !== 'toggle_sidebar' || !activeTabId) return;

  if (sidebarOpen && activeSidebarTabId === activeTabId) {
    // Close
    if (api.sidePanel && api.sidePanel.setOptions) {
      api.sidePanel.setOptions({tabId: activeTabId, enabled: false});
    } else if (api.sidebarAction && api.sidebarAction.close) {
      // Firefox sidebar is per-window
      api.sidebarAction.close();
    }
    sidebarOpen = false;
    activeSidebarTabId = null;
    broadcastSidebarStatus();
  } else {
    // Open
    if (api.sidePanel && api.sidePanel.setOptions && api.sidePanel.open) {
      // Use callback form to preserve user gesture in Chrome
      api.sidePanel.setOptions(
        {tabId: activeTabId, path: 'sidebar.html', enabled: true},
        () => api.sidePanel.open({tabId: activeTabId})
      );
      sidebarOpen = true;
      activeSidebarTabId = activeTabId;
      broadcastSidebarStatus();
    } else if (api.sidebarAction && api.sidebarAction.open) {
      api.sidebarAction.open();
      sidebarOpen = true;
      activeSidebarTabId = activeTabId;
      broadcastSidebarStatus();
    } else {
      // Fallback: open the html in a new tab
      const url = api.runtime.getURL('sidebar.html');
      api.tabs.create({ url });
    }
  }
});

// Listen for messages from content scripts
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidebar') {
    if (sender.tab) {
      toggleSidebar(sender.tab.id, true);
    }
  }
  if (message.action === 'checkSidebarStatus') {
    sendResponse({ isOpen: sidebarOpen });
  }
});

// Function to toggle the sidebar on a specific tab (only used for non-command opens)
function toggleSidebar(tabId, shouldOpen) {
  if (shouldOpen) {
    // For non-command opens (like from content script)
    if (api.sidePanel && api.sidePanel.setOptions && api.sidePanel.open) {
      api.sidePanel.setOptions({
        tabId: tabId,
        path: 'sidebar.html',
        enabled: true
      }, () => {
        api.sidePanel.open({ tabId });
        activeSidebarTabId = tabId;
        sidebarOpen = true;
        broadcastSidebarStatus();
      });
    } else if (api.sidebarAction && api.sidebarAction.open) {
      api.sidebarAction.open();
      activeSidebarTabId = tabId;
      sidebarOpen = true;
      broadcastSidebarStatus();
    } else {
      const url = api.runtime.getURL('sidebar.html');
      api.tabs.create({ url });
    }
  } else {
    // Closing doesn't require special handling
    if (api.sidePanel && api.sidePanel.setOptions) {
      api.sidePanel.setOptions({
        tabId: tabId,
        enabled: false
      }, () => {
        activeSidebarTabId = null;
        sidebarOpen = false;
        broadcastSidebarStatus();
      });
    } else if (api.sidebarAction && api.sidebarAction.close) {
      api.sidebarAction.close();
      activeSidebarTabId = null;
      sidebarOpen = false;
      broadcastSidebarStatus();
    }
  }
}

// Utility to safely send messages to tabs without console errors if no receiver exists
function safeSendMessage(tabId, message) {
  try {
    api.tabs.sendMessage(tabId, message, () => {
      // Swallow 'Receiving end does not exist' errors
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        // no-op
      }
    });
  } catch (_) {}
}

// Function to force-close by sending close signal to all tabs (for legacy support)
function forceCloseViaTabs() {
  // Mark as closed in our state
  sidebarOpen = false;
  broadcastSidebarStatus();
  
  // Tell all tabs to force close the sidebar
  api.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Only attempt to send messages to http/https tabs
      if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
        safeSendMessage(tab.id, { action: 'forceSidebarClose' });
      }
    });
  });
  
  console.log('Attempted to send force close signal to relevant tabs');
  
  // Also disable the sidebar on the tracked tab if we know it
  if (activeSidebarTabId) {
    if (api.sidePanel && api.sidePanel.setOptions) {
      api.sidePanel.setOptions({
        tabId: activeSidebarTabId,
        enabled: false
      }, () => {
        activeSidebarTabId = null;
      });
    } else if (api.sidebarAction && api.sidebarAction.close) {
      api.sidebarAction.close();
      activeSidebarTabId = null;
    }
  }
}

// When the extension icon is clicked, open the sidebar for the specific tab
const onActionClicked = (tab) => {
  console.log('Extension icon clicked, opening sidebar for tab:', tab.id);
  
  // Configure and open the sidebar for this tab using callbacks to preserve user gesture
  if (api.sidePanel && api.sidePanel.setOptions && api.sidePanel.open) {
    api.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidebar.html',
      enabled: true
    }, () => {
      api.sidePanel.open({ tabId: tab.id }, () => {
        console.log('Sidebar opened successfully from icon click');
        activeSidebarTabId = tab.id;
        sidebarOpen = true;
        broadcastSidebarStatus();
      });
    });
  } else if (api.sidebarAction && api.sidebarAction.open) {
    api.sidebarAction.open();
    activeSidebarTabId = tab.id;
    sidebarOpen = true;
    broadcastSidebarStatus();
  } else {
    const url = api.runtime.getURL('sidebar.html');
    api.tabs.create({ url });
  }
};

if (api.action && api.action.onClicked) {
  api.action.onClicked.addListener(onActionClicked);
} else if (api.browserAction && api.browserAction.onClicked) {
  api.browserAction.onClicked.addListener(onActionClicked);
}

// Function to broadcast sidebar status to content scripts
function broadcastSidebarStatus() {
  api.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Only attempt to send messages to http/https tabs
      if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
        safeSendMessage(tab.id, { action: 'sidebarStatusChanged', isOpen: sidebarOpen });
      }
    });
  });
}

// Function to open the sidebar only for a specific tab (using callback pattern)
function openSidebar(tabId, windowId) {
  console.log('Attempting to open sidebar for tab:', tabId);
  
  // Using toggleSidebar function with the open flag set to true
  toggleSidebar(tabId, true);
  
  // Always return true since the actual opening happens asynchronously
  return true;
}

// Function to close the sidebar (using callback pattern)
function closeSidebar(windowId) {
  console.log('Attempting to close sidebar');
  
  // If we know which tab has the sidebar open, close it specifically
  if (activeSidebarTabId !== null) {
    toggleSidebar(activeSidebarTabId, false);
    return true;
  }
  
  // If we don't know which tab but we have a window ID, try to get the active tab
  if (windowId) {
    api.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs && tabs.length > 0) {
        toggleSidebar(tabs[0].id, false);
      } else {
        // Last resort, use the forceCloseViaTabs method
        forceCloseViaTabs();
      }
    });
    return true;
  }
  
  // Last resort
  forceCloseViaTabs();
  return true;
}

// Listen for messages from content script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openSidebar") {
    console.log('Received openSidebar message from content script');
    
    // Use our synchronous function with a callback approach
    const success = openSidebar(sender.tab.id, sender.tab.windowId);
    sendResponse({ success: success });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
  
  if (message.action === "closeSidebar") {
    console.log('Received closeSidebar message from content script');
    
    // Use our synchronous function
    const success = closeSidebar(sender.tab?.windowId);
    sendResponse({ success: success });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
  
  if (message.action === "getSettings") {
    (async () => {
      const settings = await idbGetPreference('aiChatSettings', null);
      sendResponse(settings);
    })();
    return true;
  }

  if (message.action === "setSettings") {
    (async () => {
      await idbSetPreference('aiChatSettings', message.payload);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.action === "removeSettings") {
    (async () => {
      await idbDeletePreference('aiChatSettings');
      sendResponse({ ok: true });
    })();
    return true;
  }
  
  return true;
});

// Listen for tab updates to inject content script on YouTube navigation (Chrome-only; Firefox MV3 may not support scripting API)
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.includes('youtube.com/watch')
  ) {
    if (api.scripting && api.scripting.executeScript) {
      api.scripting.executeScript({
        target: { tabId: tabId },
        files: ['contentScript.js'],
      });
    }
  }
});

// Listen for tab activation events to manage sidebar visibility
api.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
  
  // If this is not the tab with the active sidebar, update our state
  if (activeSidebarTabId !== null && activeSidebarTabId !== activeInfo.tabId) {
    console.log('User switched to tab without sidebar, tab ID:', activeInfo.tabId);
    
    // Update our internal state to reflect that sidebar isn't visible on this tab
    sidebarOpen = false;
    broadcastSidebarStatus();
  } else if (activeSidebarTabId === activeInfo.tabId) {
    // This is the tab that should have the sidebar
    console.log('User switched back to tab with sidebar, tab ID:', activeInfo.tabId);
    
    // Update our state to show sidebar is visible
    sidebarOpen = true;
    broadcastSidebarStatus();
  }
});

// When the extension is installed or updated
api.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed or updated:", details.reason);
});
