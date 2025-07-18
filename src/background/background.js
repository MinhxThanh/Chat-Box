// This background script manages the side panel

// Track active tab and sidebar state
let activeTabId = null;          // updated on every tab switch
let sidebarOpen = false;       // global toggle

// Keep track of active tab
chrome.tabs.onActivated.addListener(({tabId}) => activeTabId = tabId);
chrome.tabs.onRemoved.addListener(id => { 
  if (id === activeTabId) activeTabId = null; 
});

// Track sidebar open state
let activeSidebarTabId = null;

// Configure the side panel behavior - allow action click to open
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Register a command shortcut for toggling the sidebar
chrome.commands.onCommand.addListener(command => {
  if (command !== 'toggle_sidebar' || !activeTabId) return;

  if (sidebarOpen && activeSidebarTabId === activeTabId) {
    // Closing never requires a user gesture
    chrome.sidePanel.setOptions({tabId: activeTabId, enabled: false});
    sidebarOpen = false;
    activeSidebarTabId = null;
    broadcastSidebarStatus();
  } else {
    // Open synchronously using callback
    chrome.sidePanel.setOptions(
      {tabId: activeTabId, path: 'sidebar.html', enabled: true},
      () => chrome.sidePanel.open({tabId: activeTabId})  // still same call stack
    );
    sidebarOpen = true;
    activeSidebarTabId = activeTabId;
    broadcastSidebarStatus();
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidebar') {
    if (sender.tab) {
      toggleSidebar(sender.tab.id, true);
    }
  }
});

// Function to toggle the sidebar on a specific tab (only used for non-command opens)
function toggleSidebar(tabId, shouldOpen) {
  if (shouldOpen) {
    // For non-command opens (like from content script)
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: 'sidebar.html',
      enabled: true
    }, () => {
      chrome.sidePanel.open({ tabId });
      activeSidebarTabId = tabId;
      sidebarOpen = true;
      broadcastSidebarStatus();
    });
  } else {
    // Closing doesn't require special handling
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    }, () => {
      activeSidebarTabId = null;
      sidebarOpen = false;
      broadcastSidebarStatus();
    });
  }
}

// Function to force-close by sending close signal to all tabs (for legacy support)
function forceCloseViaTabs() {
  // Mark as closed in our state
  sidebarOpen = false;
  broadcastSidebarStatus();
  
  // Tell all tabs to force close the sidebar
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Only attempt to send messages to http/https tabs
      if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'forceSidebarClose'
        }).catch(error => {
          // This error is expected if the content script is not injected or listening on a particular tab.
          // console.warn(`forceCloseViaTabs: Failed to send message to tab ${tab.id} (${tab.url || 'no URL'}): ${error.message}`);
        });
      }
    });
  });
  
  console.log('Attempted to send force close signal to relevant tabs');
  
  // Also disable the sidebar on the tracked tab if we know it
  if (activeSidebarTabId) {
    chrome.sidePanel.setOptions({
      tabId: activeSidebarTabId,
      enabled: false
    }, () => {
      activeSidebarTabId = null;
    });
  }
}

// When the extension icon is clicked, open the sidebar for the specific tab
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, opening sidebar for tab:', tab.id);
  
  // Configure and open the sidebar for this tab using callbacks to preserve user gesture
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidebar.html',
    enabled: true
  }, () => {
    chrome.sidePanel.open({ tabId: tab.id }, () => {
      console.log('Sidebar opened successfully from icon click');
      activeSidebarTabId = tab.id;
      sidebarOpen = true;
      broadcastSidebarStatus();
    });
  });
});

// Function to broadcast sidebar status to content scripts
function broadcastSidebarStatus() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      // Only attempt to send messages to http/https tabs
      if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'sidebarStatusChanged',
          isOpen: sidebarOpen
        }).catch(error => {
          // This error is expected if the content script is not injected or listening on a particular tab.
          // console.warn(`broadcastSidebarStatus: Failed to send message to tab ${tab.id} (${tab.url || 'no URL'}): ${error.message}`);
        });
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
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    // Get settings from chrome.storage
    chrome.storage.local.get('aiChatSettings', (result) => {
      sendResponse(result.aiChatSettings || null);
    });
    return true; // Required to use sendResponse asynchronously
  }
  
  return true;
});

// Listen for tab updates to inject content script on YouTube navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.includes('youtube.com/watch')
  ) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['contentScript.js'],
    });
  }
});

// Listen for tab activation events to manage sidebar visibility
chrome.tabs.onActivated.addListener((activeInfo) => {
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
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed or updated:", details.reason);
  
  // Set initial settings if none exist
  if (details.reason === "install") {
    const defaultSettings = {
      apiKey: 'no-api-key',
      endpoint: 'http://localhost:11434',
      models: [],
      selectedModel: 'gemma3'
    };
    chrome.storage.local.set({ aiChatSettings: defaultSettings });
  }
});
