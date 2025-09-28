import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';
import { Chat } from '../components/Chat';
import { Button } from '../components/ui/button';
import { DeleteConfirmDialog } from '../components/Message';
import ApiKeyForm from '../components/ApiKeyForm';
import { getAllConversations, saveConversation, deleteConversation, getPreference, savePreference } from '../utils/db';
import "../globals.css";
import { Settings, PlusCircle, X, Trash2, History, Plus, ArrowLeftFromLine, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import CustomPrompts from '../components/CustomPrompts';
import ProvidersConfig from '../components/ProvidersConfig';
import AdvancedSettings from '../components/AdvancedSettings';
import WhatsNewDialog from '../components/WhatsNewDialog';
import ExtentionInfo from '../components/ExtentionInfo';

// Utility function to safely convert any value to a string for rendering
const safeToString = (value) => {
  if (value === null || value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // For objects, arrays, etc., convert to a JSON string for safety
  try {
    return JSON.stringify(value);
  } catch (e) {
    return '[Object]';
  }
};

// Utility function to generate a safe React key
const generateSafeKey = (conversation, index) => {
  const id = conversation?.id || `temp-${index}`;
  return `history-${id}-${index}`;
};

// Sidebar component
const Sidebar = () => {

  const { showAlert } = useNotification();
  // States for the sidebar UI and settings
  const [activeView, setActiveView] = useState('chat'); // 'chat', 'settings', 'history'
  const [settings, setSettings] = useState({
    providers: [
      {
        selectedProvider: true,
        provider: 'Local',
        name: 'Ollama',
        endpoint: 'http://localhost:11434/v1',
        apiKey: '',
        models: []
      }
    ],
    selectedModel: null,
    quickActionsEnabled: true,
    quickActionsBlocklist: []
  });
  const [conversations, setConversations] = useState([]); // Loaded asynchronously from IndexedDB
  const [activeConversation, setActiveConversation] = useState(null); // Match the initial ID
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Load settings from IndexedDB on initial render
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await getPreference('aiChatSettings', null);
        if (stored) {
          setSettings(stored);
          return;
        }

        // Try to migrate from chrome.storage.local or localStorage (one-time)
        let migrated = null;
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            migrated = await new Promise((resolve) => {
              chrome.storage.local.get(['aiChatSettings'], (res) => resolve(res?.aiChatSettings || null));
            });
          }
        } catch (_) {}

        if (!migrated) {
          try {
            const ls = localStorage.getItem('aiChatSettings');
            if (ls) migrated = JSON.parse(ls);
          } catch (_) {}
        }

        if (migrated && migrated.providers) {
          setSettings(migrated);
          await savePreference('aiChatSettings', migrated);
          try { localStorage.removeItem('aiChatSettings'); } catch (_) {}
          return;
        }

        // Default settings with OpenAI as the selected provider
        setSettings({
          providers: [
            {
              selectedProvider: true,
              provider: 'openai',
              name: 'OpenAI',
              endpoint: 'https://api.openai.com/v1',
              apiKey: '',
              models: []
            }
          ],
          selectedModel: null,
          quickActionsEnabled: true,
          quickActionsBlocklist: []
        });
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    loadSettings();
  }, []);

  // Load conversations from IndexedDB on mount
  useEffect(() => {
    const loadConvs = async () => {
      setIsConversationsLoading(true);
      try {
        const all = await getAllConversations();
        if (all && all.length > 0) {
          // Sort conversations by timestamp in ID, descending (newest first)
          const sortedConvs = all.sort((a, b) => {
            const timeA = parseInt(a.id.split('-')[1] || 0, 10);
            const timeB = parseInt(b.id.split('-')[1] || 0, 10);
            return timeB - timeA; // Sorts from newest to oldest
          });
          setConversations(sortedConvs);
          setActiveConversation(sortedConvs[0].id); // Set the newest one as active
        } else {
          // If no conversations exist, create a new default one
          const defaultConv = { id: `conv-${Date.now()}`, title: 'New Conversation', messages: [] };
          setConversations([defaultConv]);
          setActiveConversation(defaultConv.id);
          await saveConversation(defaultConv);
        }
      } catch (err) {
        console.error('Failed to load conversations from IndexedDB', err);
        showAlert('Error', 'Error loading conversations. Please refresh the extension.');
      } finally {
        setIsConversationsLoading(false);
      }
    };
    loadConvs();
  }, []);

  // Persist every conversation change to IndexedDB
  useEffect(() => {
    conversations.forEach(c => {
      // Basic guard to avoid saving empty placeholder
      if (c && c.id) {
        saveConversation(c);
      }
    });
  }, [conversations]);

  // Save settings to IndexedDB whenever they change
  useEffect(() => {
    savePreference('aiChatSettings', settings);
  }, [settings]);

  // Check if user should see the "What's New" dialog
  useEffect(() => {
    const CURRENT_VERSION = '0.7.4';
    const WHATS_NEW_KEY = `whatsNew_${CURRENT_VERSION}`;
    
    // Check if user has already seen the What's New dialog for this version
    const hasSeenWhatsNew = localStorage.getItem(WHATS_NEW_KEY);
    
    if (!hasSeenWhatsNew) {
      // Show the dialog after a brief delay to ensure everything is loaded
      setTimeout(() => {
        setShowWhatsNew(true);
      }, 1000);
    }
  }, []);

  // Function to handle closing the What's New dialog
  const handleWhatsNewClose = () => {
    const CURRENT_VERSION = '0.7.4';
    const WHATS_NEW_KEY = `whatsNew_${CURRENT_VERSION}`;
    
    // Mark as seen in localStorage
    localStorage.setItem(WHATS_NEW_KEY, 'true');
    setShowWhatsNew(false);
  };

  // Get the currently selected provider
  const getSelectedProvider = () => {
    if (!settings.providers || settings.providers.length === 0) return null;
    return settings.providers.find(p => p.selectedProvider) || settings.providers[0];
  };

  // Function to save settings
  const saveSettings = () => {
    // We're already saving via useEffect, so this is just for user feedback
    showAlert('Success', 'Provider settings and models saved!',
      () => setActiveView('chat'));
  };

  // Function to create a new chat
  const createNewChat = () => {
    // Create a unique timestamp-based ID
    const timestamp = Date.now();
    const newId = `chat-${timestamp}-${Math.random().toString(36).substring(2, 7)}`;
    const newConversation = {
      id: newId,
      title: 'New Conversation', // Start with a simple title
      messages: []
    };

    const newList = [newConversation, ...conversations];
    setConversations(newList);
    saveConversation(newConversation);
    setActiveConversation(newId);
    setActiveView('chat');
  };

  // Render the settings view
  const renderSettingsView = () => {

    return (
      <div className="p-4 space-y-4 h-full overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Settings</h2>
            <ExtentionInfo />
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveView('chat')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <Tabs defaultValue="providers" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          {/* Providers configuration */}
          <TabsContent value="providers">
            <ProvidersConfig
              settings={settings}
              onSettingsChange={setSettings}
              onSaveSettings={saveSettings}
              showAlert={showAlert}
            />
          </TabsContent>

          {/* Search configure */}
          <TabsContent value="search">
            {/* Form enter Custom Web Search Engine API*/}
            <div className="mt-2">
              <ApiKeyForm />
            </div>
          </TabsContent>

          {/* Prompts configure */}
          <TabsContent value="prompts">
            {/* Form enter Custom Web Search Engine API*/}
            <div className="mt-2">
              <CustomPrompts />
            </div>
          </TabsContent>

          {/* Advanced configure */}
          <TabsContent value="advanced">
            <AdvancedSettings settings={settings} onSettingsChange={setSettings} />
          </TabsContent>

        </Tabs>

      </div>
    );
  };

  // State for delete confirmation dialog
  const [deleteDialogState, setDeleteDialogState] = useState({
    isOpen: false,
    conversationId: null
  });

  // Function to delete a conversation with confirmation
  const handleDeleteConversation = (conversationId) => {
    if (conversations.length <= 1) {
      // Don't allow deleting the last conversation
      showAlert('Cannot Delete', 'Cannot delete the last conversation');
      return;
    }

    // Open confirmation dialog
    setDeleteDialogState({
      isOpen: true,
      conversationId
    });
  };

  // Function to confirm deletion
  const confirmDeleteConversation = async () => {
    const { conversationId } = deleteDialogState;
    if (!conversationId) return;

    try {
      await deleteConversation(conversationId);
      const updatedConversations = conversations.filter(c => c.id !== conversationId);
      setConversations(updatedConversations);

      if (activeConversation === conversationId) {
        setActiveConversation(updatedConversations[0].id);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      showAlert('Error', 'Failed to delete conversation.');
    } finally {
      setDeleteDialogState({
        isOpen: false,
        conversationId: null
      });
    }
  };

  // Function to automatically generate title based on the first AI answer
  const generateConversationTitle = (messages, conversationId) => {
    // Ensure conversationId is a string and use a fallback if not.
    // This prevents errors with .substring() and ensures a usable ID.
    const displayShortId = (typeof conversationId === 'string' && conversationId.length > 0)
      ? conversationId.substring(0, 6) // Takes first 6 chars, or fewer if id is shorter.
      : 'xxxxxx'; // Fallback for null, undefined, non-string, or empty string conversationId.

    const fallbackTitle = `Conversation ${displayShortId}`;

    if (!messages || messages.length === 0) {
      return "New Conversation"; // Changed to return 'New Conversation' for new chats
    }

    // Added 'm &&' to safely access m.role, preventing errors if m is null/undefined in the array.
    const firstAIMessage = messages.find(m => m && m.role === 'assistant');
    if (!firstAIMessage) {
      const firstUserMessage = messages.find(m => m && m.role === 'user');
      if (firstUserMessage) {
        return `New Chat ${displayShortId}`;
      }
      return fallbackTitle;
    }

    let textContent = '';
    // Added 'firstAIMessage.content &&' to ensure content exists before checking if it's an array or string.
    if (firstAIMessage.content && Array.isArray(firstAIMessage.content)) {
      const textParts = firstAIMessage.content
        // Added 'item &&' and 'typeof item.text === "string"' for robust filtering.
        .filter(item => item && item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text);
      textContent = textParts.join('\n');
    } else if (typeof firstAIMessage.content === 'string') {
      textContent = firstAIMessage.content;
    }
    // If content is not an array or string, or is missing, textContent remains '', which is handled below.

    if (!textContent || textContent.trim() === '') {
      const userMessage = messages.find(m => m && m.role === 'user');
      // Added 'userMessage.content &&' and 'item &&' for robustness.
      if (userMessage && userMessage.content && Array.isArray(userMessage.content) &&
        userMessage.content.some(item => item && item.type === 'image_url')) {
        return `Image Chat ${displayShortId}`;
      }
      return `AI Chat ${displayShortId}`; // Ensured displayShortId is used here.
    }

    let title = textContent.split('\n')[0];
    title = title.split('.')[0];

    title = title.replace(/[#*`_[\]]/g, '').trim();

    if (title.length > 30) {
      title = title.substring(0, 27) + '...';
    } else if (title.trim() === '') {
      return fallbackTitle; // Use the main fallback if processed title is empty.
    }

    return `${title} [${displayShortId}]`;
  };

  // Render the history view
  const renderHistoryView = () => (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">History</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setActiveView('chat')}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <Button onClick={createNewChat} className="w-full mt-4">
        <PlusCircle className="h-4 w-4 mr-2" /> New Conversation
      </Button>

      <div className="space-y-2">
        {conversations.map((conversation, index) => (
          <div
            key={generateSafeKey(conversation, index)}
            className={`p-3 rounded-md ${safeToString(activeConversation) === safeToString(conversation.id) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
          >
            <div className="flex items-center justify-between">
              <span
                className="truncate flex-1 cursor-pointer"
                onClick={() => {
                  setActiveConversation(conversation.id);
                  setActiveView('chat');
                }}
              >
                {safeToString(conversation.title)}
              </span>
              <div className="flex items-center">
                <span className="text-xs opacity-70 mr-2">
                  {safeToString(conversation.messages.filter(m => m.role !== 'system').length)} messages
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conversation.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialogState.isOpen}
        onClose={() => setDeleteDialogState({ isOpen: false, conversationId: null })}
        onConfirm={confirmDeleteConversation}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
      />
    </div>
  );

  const currentConversation = useMemo(() => {
    const findConversation = conversations.find(c => c.id === activeConversation) || conversations[0] || null;

    if (findConversation) {
      return {
        ...findConversation,
        title: typeof findConversation.title === 'string' ? findConversation.title : 'Untitled',
        messages: Array.isArray(findConversation.messages) ? findConversation.messages : []
      };
    }

    // Return a stable fallback object if no conversation is found
    return {
      id: 'fallback-conversation',
      title: 'New Conversation',
      messages: []
    };
  }, [conversations, activeConversation]);

  const handleUpdateConversation = useCallback((updatedConversation) => {
    // Ensure the updated conversation is a valid object with an id and messages array
    if (!updatedConversation || typeof updatedConversation !== 'object' || !updatedConversation.id || !Array.isArray(updatedConversation.messages)) {
      console.error('Invalid conversation format:', updatedConversation);
      return;
    }

    let conversationToUpdate = { ...updatedConversation };

    // Auto-generate title from the first user message
    if (conversationToUpdate.title === 'New Conversation' && conversationToUpdate.messages.length > 0) {
      const firstUserMessage = conversationToUpdate.messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        let title = '';
        if (typeof firstUserMessage.content === 'string') {
          title = firstUserMessage.content;
        } else if (Array.isArray(firstUserMessage.content)) {
          const textPart = firstUserMessage.content.find(p => p.type === 'text');
          if (textPart) {
            title = textPart.text;
          }
        }

        if (title) {
          // Truncate title to a reasonable length
          conversationToUpdate.title = title.substring(0, 50);
        }
      }
    }

    setConversations(prevConversations =>
      prevConversations.map(c =>
        c.id === conversationToUpdate.id ? conversationToUpdate : c
      )
    );
  }, []);

  if (isConversationsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
        <header className="p-3 border-b border-border flex items-center justify-between bg-background relative z-10">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="30" height="30" viewBox="0,0,256,256">
              <g fill="#ffffff" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{ mixBlendMode: 'normal' }}><g transform="scale(5.12,5.12)"><path d="M49.726,25.312l-18,-19c-0.003,-0.003 -0.007,-0.004 -0.01,-0.007c-0.074,-0.076 -0.165,-0.133 -0.26,-0.182c-0.022,-0.011 -0.038,-0.031 -0.061,-0.041c-0.074,-0.032 -0.158,-0.038 -0.24,-0.051c-0.05,-0.008 -0.095,-0.031 -0.146,-0.031c-0.001,0 -0.003,0.001 -0.005,0.001c-0.001,0 -0.003,-0.001 -0.004,-0.001h-11.852c-0.026,0 -0.048,0.013 -0.074,0.015c-0.025,-0.002 -0.048,-0.015 -0.074,-0.015c-0.002,0 -0.005,0 -0.007,0c-0.272,0.002 -0.532,0.114 -0.719,0.312l-17.98,18.98c-0.001,0.001 -0.001,0.001 -0.002,0.002l-0.017,0.018c-0.038,0.041 -0.056,0.091 -0.086,0.136c-0.039,0.058 -0.085,0.11 -0.112,0.176c-0.098,0.241 -0.098,0.51 0,0.751c0.027,0.066 0.073,0.118 0.112,0.176c0.03,0.045 0.048,0.095 0.086,0.136l0.017,0.018c0.001,0.001 0.001,0.001 0.002,0.002l17.98,18.979c0.188,0.2 0.451,0.354 0.726,0.312c0.026,0 0.049,-0.013 0.074,-0.015c0.026,0.004 0.048,0.017 0.074,0.017h11.632c0.039,0 0.072,-0.018 0.11,-0.022c0.038,0.004 0.072,0.022 0.11,0.022c0.002,0 0.005,0 0.007,0c0.272,-0.002 0.532,-0.114 0.719,-0.312l18,-19c0.366,-0.386 0.366,-0.99 0,-1.376zM46.675,25h-8.725l-11.575,-11.869l4.611,-4.69zM36.023,25.888c-0.003,0.029 -0.016,0.054 -0.017,0.083l-11.033,11.412l-11.172,-11.462l11.172,-11.364zM28.615,8l-3.636,3.698l-3.607,-3.698zM19.011,8.443l4.565,4.682l-11.674,11.875h-8.577zM19.008,43.554l-15.683,-16.554h8.675c0.018,0 0.032,-0.009 0.05,-0.01l11.532,11.832zM21.358,44l3.621,-3.745l3.65,3.745zM30.99,43.557l-4.621,-4.741l11.424,-11.816h8.882z"></path></g></g>
            </svg>
            Chat Box
          </h1>
          {(!getSelectedProvider()?.apiKey || !getSelectedProvider()?.endpoint) && (
            <span className="text-xs text-destructive">
              ⚠️ API settings not configured
            </span>
          )}
        </header>

        <main className="flex-1 overflow-hidden relative z-10 bg-background">
          {activeView === 'chat' && (
            <Chat
              conversation={currentConversation}
              onUpdateConversation={handleUpdateConversation}
              onNewConversation={createNewChat}
              provider={(() => {
                const sp = getSelectedProvider();
                return sp?.provider || null;
              })()}
              apiKey={(() => {
                if (settings.selectedModel) {
                  const providerWithModel = settings.providers.find(p => p.models?.includes(settings.selectedModel));
                  if (providerWithModel) return providerWithModel.apiKey;
                }
                return getSelectedProvider()?.apiKey || '';
              })()}
              endpoint={(() => {
                if (settings.selectedModel) {
                  const providerWithModel = settings.providers.find(p => p.models?.includes(settings.selectedModel));
                  if (providerWithModel) return providerWithModel.endpoint;
                }
                return getSelectedProvider()?.endpoint || '';
              })()}
              model={settings.selectedModel}
              temperature={settings.temperature}
              maxTokens={settings.maxTokens}
              contextWindow={settings.contextWindow}

              availableModels={(() => {
                const modelsMap = {};
                settings.providers.forEach(provider => {
                  if (provider.apiKey && provider.models && provider.models.length > 0) {
                    modelsMap[provider.name] = provider.models;
                  }
                });
                if (Object.keys(modelsMap).length === 0) {
                  const selectedProvider = getSelectedProvider();
                  if (selectedProvider) {
                    modelsMap[selectedProvider.name || 'Default'] = selectedProvider.models || [];
                  }
                }
                return modelsMap;
              })()}
              onModelChange={(newModel) => {
                setSettings({ ...settings, selectedModel: newModel });
              }}
            />
          )}
          {activeView === 'settings' && renderSettingsView()}
          {activeView === 'history' && renderHistoryView()}
        </main>
      </div>

      {/* Right Navigation */}
      <div className="w-14 border-l border-border flex flex-col items-center py-4 space-y-4">
        {/* <Button variant="ghost" size="icon" onClick={() => chrome.runtime.sendMessage({ action: 'closeSidebar' })} title="Close Sidebar">
          <X className="h-4 w-4" />
        </Button>
        <hr /> */}

        <Button
          variant={activeView === 'history' ? "default" : "ghost"}
          size="icon"
          onClick={() => setActiveView('history')}
          title="History"
        >
          <History className="h-6 w-6" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={createNewChat}
          title="New Chat"
        >
          <Plus className="h-6 w-6" />
        </Button>

        <div className="flex-1"></div> {/* Spacer */}
        <Button
          variant={activeView === 'chat' ? "default" : "ghost"}
          size="icon"
          onClick={() => setActiveView('chat')}
          title="Chat"
        >
          <ArrowLeftFromLine className="h-6 w-6" />
        </Button>

        <Button
          variant={activeView === 'settings' ? "default" : "ghost"}
          size="icon"
          onClick={() => setActiveView('settings')}
          title="Settings"
        >
          <Settings className="h-6 w-6" />
        </Button>


      </div>

      {/* What's New Dialog */}
      <WhatsNewDialog 
        open={showWhatsNew} 
        onOpenChange={handleWhatsNewClose}
      />
    </div>
  );
};

export default Sidebar;
