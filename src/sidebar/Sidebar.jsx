import React, { useState, useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { Chat } from '../components/Chat';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DeleteConfirmDialog } from '../components/Message';
import ApiKeyForm from '../components/ApiKeyForm';
import "../globals.css";
import { Settings, PlusCircle, X, Save, Loader2, Trash2, History, Plus, MoveLeft, ArrowLeftFromLine, Minus } from 'lucide-react';

// Import provider icons
import OpenAIIcon from '../../assets/providers/OpenAI.svg';
import ClaudeIcon from '../../assets/providers/anthropic.svg';
import DeepSeekIcon from '../../assets/providers/DeepSeek.svg';
import GroqIcon from '../../assets/providers/Groq.svg';
import CustomIcon from '../../assets/providers/Custom.svg';
import LocalIcon from '../../assets/providers/local.svg';

// Utility function to safely convert any value to a string for rendering
const safeToString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // For objects, arrays, etc., convert to a JSON string for safety
  try {
    return JSON.stringify(value);
  } catch (e) {
    return '[Object]';
  }
};

const Sidebar = () => {
  const { showAlert } = useNotification();
  // States for the sidebar UI and settings
  const [activeView, setActiveView] = useState('chat'); // 'chat', 'settings', 'history'
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
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
    selectedModel: null
  });
  const [conversations, setConversations] = useState([{
    id: `default-${Date.now()}`, // Ensure unique ID with timestamp
    title: 'New Conversation',
    messages: []
  }]);
  const [activeConversation, setActiveConversation] = useState(`default-${Date.now()}`); // Match the initial ID

  // Load settings from localStorage on initial render
  useEffect(() => {
    const savedSettings = localStorage.getItem('aiChatSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    } else {
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
        selectedModel: null
      });
    }

    const savedConversations = localStorage.getItem('aiChatConversations');
    if (savedConversations) {
      try {
        // Parse conversations and ensure each has a unique ID
        const parsedConversations = JSON.parse(savedConversations);
        
        // Ensure each conversation has a unique ID and prevent duplicate titles
        const usedIds = new Set();
        const conversationsWithUniqueIds = parsedConversations.map(conversation => {
          // Generate a new ID if missing, invalid, or duplicate
          let id = conversation.id;
          if (!id || typeof id !== 'string' || usedIds.has(id)) {
            id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          }
          usedIds.add(id);
          
          // Ensure title is always a valid string
          let currentTitle = conversation.title;
          if (typeof currentTitle !== 'string' || currentTitle.trim() === '') {
            // Use a default title if it's not a string or is empty/whitespace
            currentTitle = `Conversation ${id.substring(0, 6)}`;
          }
          
          return {
            ...conversation,
            id,
            title: currentTitle // Assign the sanitized title
          };
        });
        
        setConversations(conversationsWithUniqueIds);
      } catch (error) {
        console.error('Error parsing conversations:', error);
        // If there's an error, create a default conversation
        setConversations([{
          id: `default-${Date.now()}`,
          title: 'New Conversation',
          messages: []
        }]);
      }
    }
  }, []);

  // Save settings to localStorage and chrome.storage.local whenever they change
  useEffect(() => {
    // Save to localStorage for web access
    localStorage.setItem('aiChatSettings', JSON.stringify(settings));
    
    // Also save to chrome.storage.local for content script access
    if (chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.set({ aiChatSettings: settings }, () => {
          console.log('Settings synced to chrome.storage.local');
        });
      } catch (error) {
        console.error('Error syncing settings to chrome.storage:', error);
      }
    }
  }, [settings]);

  // Get the currently selected provider
  const getSelectedProvider = () => {
    if (!settings.providers || settings.providers.length === 0) return null;
    return settings.providers.find(p => p.selectedProvider) || settings.providers[0];
  };

  // Function to load available models from the API
  const loadModels = async () => {
    const selectedProvider = getSelectedProvider();
    
    if (!selectedProvider) {
      showAlert('Provider Required', 'Please select a provider first');
      return;
    }
    
    if (!selectedProvider.apiKey) {
      showAlert('API Key Required', 'Please enter your API key first');
      return;
    }
    
    // For custom provider, ensure endpoint is set
    if ((selectedProvider.provider === 'custom' || selectedProvider.provider === 'local') && (!selectedProvider.endpoint)) {
      showAlert('Endpoint Required', 'Please enter the API endpoint for your custom or local provider.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = selectedProvider.endpoint;
      
      // This is a simplified example - actual endpoint might be different based on the AI provider
      const response = await fetch(`${endpoint}/models`, {
        headers: {
          'Authorization': `Bearer ${selectedProvider.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load models: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract models from response (format varies by provider)
      const models = data.data || data.models || [];

      // Find the current provider by ID instead of the selectedProvider flag
      // This ensures we update the correct provider even if selection changes
      const providerType = selectedProvider.provider;
      
      // Update only the specific provider with the models, preserving all other providers
      const updatedProviders = settings.providers.map(provider => {
        if (provider.provider === providerType) {
          return {
            ...provider,
            models: models.map(m => m.id || m)
          };
        }
        return provider;
      });

      // Update settings with available models
      setSettings({
        ...settings,
        providers: updatedProviders
      });
    } catch (error) {
      console.error('Error loading models:', error);
      showAlert('Error', `Error loading models: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to save settings
  const saveSettings = () => {
    // We're already saving via useEffect, so this is just for user feedback
    alert('Settings saved successfully!');
    setActiveView('chat');
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

    setConversations([...conversations, newConversation]);
    setActiveConversation(newId);
    setActiveView('chat');
  };

  // Render the settings view
  const renderSettingsView = () => {
    // Predefined providers
    const predefinedProviders = [
      {
        provider: "openai",
        name: "OpenAI",
        endpoint: "https://api.openai.com/v1",
        icon: OpenAIIcon
      },
      {
        provider: "claude",
        name: "Claude",
        endpoint: "https://api.anthropic.com/v1",
        icon: ClaudeIcon
      },
      {
        provider: "deepseek",
        name: "DeepSeek",
        endpoint: "https://api.deepseek.com/v1",
        icon: DeepSeekIcon
      },
      {
        provider: "groq",
        name: "Groq",
        endpoint: "https://api.groq.com/openai/v1",
        icon: GroqIcon
      },
      {
        provider: "local",
        name: "Local",
        endpoint: "",
        icon: LocalIcon
      },
      {
        provider: "custom",
        name: "Custom",
        endpoint: "",
        icon: CustomIcon
      }
    ];

    // Get current selected provider from local function reference
    const localSelectedProvider = getSelectedProvider();

    const selectedProvider = localSelectedProvider;

    // Handle provider selection
    const selectProvider = (providerType) => {
      // Make a deep copy of the current providers to prevent modifying the original array
      const newProviders = settings.providers ? JSON.parse(JSON.stringify(settings.providers)) : [];
      
      // Check if this provider already exists
      const existingIndex = newProviders.findIndex(p => p.provider === providerType);
      
      // If it exists, just select it
      if (existingIndex >= 0) {
        // Mark only this provider as selected but preserve all providers' data
        newProviders.forEach((p, i) => {
          p.selectedProvider = i === existingIndex;
        });
      } else {
        // Create a new provider of this type
        const template = predefinedProviders.find(p => p.provider === providerType);
        const newProvider = {
          selectedProvider: true,
          provider: providerType,
          name: template.name,
          endpoint: template.endpoint,
          apiKey: "",
          models: []
        };
        
        // Deselect all existing providers but keep their data
        newProviders.forEach(p => p.selectedProvider = false);
        newProviders.push(newProvider);
      }
      
      // Update settings with the new providers array
      // This preserves the previously configured providers
      setSettings({
        ...settings,
        providers: newProviders
      });
    };

    // Update current provider's API key
    const updateProviderApiKey = (apiKey) => {
      if (!selectedProvider) return;
      
      const newProviders = settings.providers.map(p => {
        if (p.selectedProvider) {
          return {...p, apiKey};
        }
        return p;
      });
      
      setSettings({
        ...settings,
        providers: newProviders
      });
    };

    // Update provider's endpoint (for custom and local)
    const updateProviderEndpoint = (endpoint) => {
      if (!selectedProvider || (selectedProvider.provider !== 'custom' && selectedProvider.provider !== 'local')) return;
      
      const newProviders = settings.providers.map(p => {
        if (p.selectedProvider) {
          return {...p, endpoint};
        }
        return p;
      });
      
      setSettings({
        ...settings,
        providers: newProviders
      });
    };

    // Load models for selected provider
    const loadProviderModels = () => {
      loadModels();
    };

    // Select a model from the current provider
    const selectModel = (model) => {
      setSettings({
        ...settings,
        selectedModel: model
      });
    };

    return (
      <div className="p-4 space-y-4 h-full overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveView('chat')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
  
        <div className="space-y-5">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="grid grid-cols-2 gap-2">
              {predefinedProviders.map((provider) => (
                <div
                  key={provider.provider}
                  className={`p-2 rounded-md cursor-pointer border flex items-center justify-center gap-2 ${selectedProvider?.provider === provider.provider ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                  onClick={() => selectProvider(provider.provider)}
                >
                  <img src={provider.icon} alt="" className="w-5 h-5" />
                  <span>{provider.name}</span>
                </div>
              ))}
            </div>
          </div>
  
          {/* API Key for all providers */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={selectedProvider?.apiKey || ''}
              onChange={(e) => updateProviderApiKey(e.target.value)}
              placeholder={selectedProvider?.provider === 'local' ? 'API Key (default: no-key)' : `Enter your ${selectedProvider?.name || 'provider'} API key`}
            />
          </div>
  
          {/* Endpoint (for custom and local providers) */}
          {(selectedProvider?.provider === 'custom' || selectedProvider?.provider === 'local') && (
            <div className="space-y-2">
              <Label htmlFor="endpoint">API Endpoint</Label>
              <Input
                id="endpoint"
                type="text"
                value={selectedProvider?.endpoint || ''}
                onChange={(e) => updateProviderEndpoint(e.target.value)}
                placeholder={selectedProvider?.provider === 'local' ? 'http://localhost:1234/v1' : 'https://api.example.com/v1'}
              />
            </div>
          )}
  
          {/* Models Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Models</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={loadProviderModels}
                disabled={loading || !selectedProvider?.apiKey}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Load Models
              </Button>
            </div>
  
            {/* Add function to remove a model from the list */}
            {(() => {
              // Function to remove a model from the current provider's list
              const removeModel = (modelToRemove) => {
                if (!selectedProvider) return;
                
                const newProviders = settings.providers.map(p => {
                  if (p.selectedProvider) {
                    return {
                      ...p,
                      models: p.models.filter(model => model !== modelToRemove)
                    };
                  }
                  return p;
                });
                
                // If we're removing the currently selected model, deselect it
                let newSelectedModel = settings.selectedModel;
                if (settings.selectedModel === modelToRemove) {
                  newSelectedModel = null;
                }
                
                setSettings({
                  ...settings,
                  providers: newProviders,
                  selectedModel: newSelectedModel
                });
              };
              
              return selectedProvider?.models?.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {selectedProvider.models.map((model) => (
                    <div
                      key={safeToString(model)}
                      className={`p-2 rounded-md border flex justify-between items-center ${settings.selectedModel === model ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                    >
                      <div 
                        className="flex-1 cursor-pointer truncate"
                        onClick={() => selectModel(model)}
                      >
                        {safeToString(model)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-2 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeModel(model);
                        }}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">No models loaded. Click 'Load Models' to fetch available models.</div>
              );
            })()}
            
          </div>
  
          <Button 
            onClick={() => {
              // Only validate the current provider
              const provider = getSelectedProvider();
              
              // Only validate if there's a current provider
              if (provider) {
                // Only validate the provider if it has data - if it has no API key, 
                // we'll still save it but it won't be usable
                if (provider.apiKey && provider.provider === 'custom' && !provider.endpoint) {
                  showAlert('Endpoint Required', 'Please enter an endpoint for your custom provider.');
                  return;
                }
              }
              
              // Filter out any providers with no API key before saving
              const providersToSave = settings.providers.filter(p => p.apiKey);
              
              if (providersToSave.length === 0) {
                showAlert('Provider Required', 'Please configure at least one provider with an API key before saving.');
                return;
              }
              
              // Save the settings while keeping all configured providers
              localStorage.setItem('aiChatSettings', JSON.stringify(settings));
              
              showAlert('Success', 'Provider settings and models saved!', 
                () => setActiveView('chat'));
            }} 
            className="w-full mt-4"
          >
            <Save className="h-4 w-4 mr-2" /> Save Settings
          </Button>
        </div>

         {/* Form enter Custom Web Search Engine API*/}
         <div className="mt-8 pt-4 border-t border-border">
           <ApiKeyForm />
         </div>
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
  const confirmDeleteConversation = () => {
    const { conversationId } = deleteDialogState;
    if (!conversationId) return;

    // Filter out the conversation to delete
    const updatedConversations = conversations.filter(c => c.id !== conversationId);
    setConversations(updatedConversations);

    // If we're deleting the active conversation, switch to another one
    if (activeConversation === conversationId) {
      setActiveConversation(updatedConversations[0].id);
    }

    // Close the dialog
    setDeleteDialogState({
      isOpen: false,
      conversationId: null
    });
  };

  // Function to rename a conversation
  const handleRenameConversation = (conversationId, newTitle) => {
    const updatedConversations = conversations.map(c =>
      c.id === conversationId ? { ...c, title: newTitle } : c
    );
    setConversations(updatedConversations);
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
        {[...conversations].reverse().map((conversation) => (
          <div
            key={`history-${safeToString(conversation.id)}`}
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

  // Get the current conversation
  // Ensure we're passing a properly structured conversation object to Chat
  const findConversation = conversations.find(c => c.id === activeConversation) || conversations[0] || null;
  const currentConversation = findConversation ? {
    id: typeof findConversation.id === 'string' ? findConversation.id : String(findConversation.id || ''),
    title: typeof findConversation.title === 'string' ? findConversation.title : 'Untitled',
    messages: Array.isArray(findConversation.messages) ? findConversation.messages : []
  } : {
    id: `fallback-${Date.now()}`,
    title: 'New Conversation',
    messages: []
  };

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
              apiKey={(() => {
                // Find the provider that owns the selected model
                if (settings.selectedModel) {
                  // Find which provider has this model
                  const providerWithModel = settings.providers.find(provider => 
                    provider.models && provider.models.includes(settings.selectedModel)
                  );
                  
                  // If found, use that provider's API key
                  if (providerWithModel) {
                    return providerWithModel.apiKey;
                  }
                }
                
                // Fallback to selected provider
                return getSelectedProvider()?.apiKey || '';
              })()}
              endpoint={(() => {
                // Find the provider that owns the selected model
                if (settings.selectedModel) {
                  // Find which provider has this model
                  const providerWithModel = settings.providers.find(provider => 
                    provider.models && provider.models.includes(settings.selectedModel)
                  );
                  
                  // If found, use that provider's endpoint
                  if (providerWithModel) {
                    return providerWithModel.endpoint;
                  }
                }
                
                // Fallback to selected provider
                return getSelectedProvider()?.endpoint || '';
              })()}
              model={settings.selectedModel}
              availableModels={(() => {
                // Create an object with models from all providers that have API keys
                const modelsMap = {};
                
                // Loop through all providers
                settings.providers.forEach(provider => {
                  // Only include providers with API keys and models
                  if (provider.apiKey && provider.models && provider.models.length > 0) {
                    modelsMap[provider.name] = provider.models;
                  }
                });
                
                // If no providers have models, fall back to the current provider
                if (Object.keys(modelsMap).length === 0) {
                  modelsMap[getSelectedProvider()?.name || 'Default'] = getSelectedProvider()?.models || [];
                }
                
                return modelsMap;
              })()}
              onModelChange={(newModel) => {
                setSettings({ ...settings, selectedModel: newModel });
              }}
              conversation={currentConversation}
              onUpdateConversation={(updatedMessages) => {
                // Ensure messages are valid before updating state
                if (!Array.isArray(updatedMessages)) {
                  console.error('Invalid messages format:', updatedMessages);
                  return;
                }
                
                // Create a new array reference to trigger React update
                const updatedConversations = conversations.map(c => {
                  if (c.id === activeConversation) {
                    // Create a new object reference for the updated conversation
                    return { 
                      ...c, 
                      // Ensure valid title and message format
                      title: typeof c.title === 'string' ? c.title : 'Untitled',
                      messages: updatedMessages 
                    };
                  }
                  return c;
                });
                setConversations(updatedConversations);
              }}
            />
          )}
          {activeView === 'settings' && renderSettingsView()}
          {activeView === 'history' && renderHistoryView()}
        </main>
      </div>

      {/* Right Navigation */}
      <div className="w-14 border-l border-border flex flex-col items-center py-4 space-y-4">
        <Button variant="ghost" size="icon" onClick={() => chrome.runtime.sendMessage({ action: 'closeSidebar' })} title="Close Sidebar">
          <X className="h-4 w-4" />
        </Button>
        <hr />
      
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
    </div>
  );
};

export default Sidebar;
