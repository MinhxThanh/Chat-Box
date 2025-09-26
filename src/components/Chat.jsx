import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Message, SystemMessage } from "./Message";
import { Send, Loader2, Plus, Image, FileText, X, Globe, Square, ArrowDown, FileScan, Minus } from "lucide-react";
import { extractTextFromDocument, DocumentContext } from "./DocumentProcessor";
import { YouTubeContext } from "./YouTubeContext";
import { WELCOME_MESSAGE, FAST_SUMMARY_PROMPT} from "../utils/prompts";
import { getAllPrompts } from '../db/promptDb';
import { YoutubeTranscript } from 'youtube-transcript';
import { saveImage, getImage } from "../utils/db";
import { scrapeMultipleUrls } from "../utils/urlScraper";
import { getSearchEngineConfig } from "../utils/searchUtils";
import TurndownService from 'turndown';
import { streamChatViaSDK, completeOnceViaSDK, detectSdkProvider } from "../utils/llmClient";

export const Chat = ({
  conversation,
  onUpdateConversation,
  onNewConversation,
  provider,
  apiKey,
  endpoint,
  model,
  temperature,
  maxTokens,
  contextWindow,

  availableModels,
  onModelChange
}) => {
  const [messages, setMessages] = useState(
    conversation?.messages?.length > 0
      ? conversation.messages
      : [{ role: "system", content: WELCOME_MESSAGE }]
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null); // Will now store { file, id } for images
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);
  const [imageUrls, setImageUrls] = useState({}); // Stores blob URLs for images in messages
  const [isFileDropdownOpen, setIsFileDropdownOpen] = useState(false);
  const [fileUploadError, setFileUploadError] = useState(null);
  // Document chat states
  const [documentFile, setDocumentFile] = useState(null);
  const [documentContent, setDocumentContent] = useState(null);
  const [isProcessingDocument, setIsProcessingDocument] = useState(false);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  // YouTube content state
  const [youtubeInfo, setYoutubeInfo] = useState(null);
  const [blockYoutubeDetection, setBlockYoutubeDetection] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [detectedUrls, setDetectedUrls] = useState([]);
  const [initialSystemMessage, setInitialSystemMessage] = useState(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [prompts, setPrompts] = useState([]);
  const [filteredPrompts, setFilteredPrompts] = useState([]);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);

  useEffect(() => {
    const fetchPrompts = async () => {
      const allPrompts = await getAllPrompts();
      setPrompts(allPrompts);
    };
    fetchPrompts();
  }, []);
  const [selectedText, setSelectedText] = useState(null);
  const [firstMessageSent, setFirstMessageSent] = useState(false);
  // Quick summary UI for active http(s) tab
  const [quickSummaryUrl, setQuickSummaryUrl] = useState(null);
  const [showQuickSummary, setShowQuickSummary] = useState(false);
  const [isQuickSummaryLoading, setIsQuickSummaryLoading] = useState(false);
  const quickSummaryDismissedRef = useRef(false);
  
  // Track if YouTube detection has been attempted for current conversation
  const youtubeDetectionAttempted = useRef(null);

  // Clear YouTube context and block re-detection
  const clearYoutubeContext = useCallback(() => {
    // First clear the YouTube info from state
    setYoutubeInfo(null);

    // Block YouTube detection permanently until page reload or explicit re-enable
    setBlockYoutubeDetection(true);

    // Filter out YouTube-related system messages and add confirmation message
    setMessages(prev => {
      // Remove YouTube detection messages
      const filteredMessages = prev.filter(msg =>
        !(msg.role === 'system' &&
          (msg.content.includes('YouTube video detected:') ||
            msg.content.includes('Ask questions about this video'))));

      // Add clearing confirmation message
      return [
        ...filteredMessages,
        { role: "system", content: "YouTube video context cleared." }
      ];
    });

    // Also clear from session storage if it exists
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('youtubeVideoContext');
    }

    console.log('YouTube detection blocked after clearing');
  }, [setMessages]);
  // Scraped URL content state
  const [scrapedUrlContent, setScrapedUrlContent] = useState(null);
  const [scrapedUrlChunks, setScrapedUrlChunks] = useState([]);
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);

  const messagesEndRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const textareaRef = useRef(null);
  const fileDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 200;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  useEffect(() => {
    // Cleanup function to run when the component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount


  // Detect active http(s) tab and show quick summary pill when sidebar opens
  useEffect(() => {
    if (quickSummaryDismissedRef.current) return;
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          const url = tab && tab.url;
          if (url && /^https?:\/\//i.test(url)) {
            setQuickSummaryUrl(url);
            setShowQuickSummary(true);
          }
        });
      }
    } catch (_) {}
  }, []);

  const handleQuickSummaryClick = async () => {
    if (isQuickSummaryLoading) return;
    
    // Guard: ensure provider is configured before sending
    if (!apiKey || !endpoint || !model) {
      setMessages(prev => [...prev, { role: "system", content: "Please configure your provider and select a model in settings before using quick summary." }]);
      return;
    }

    setIsQuickSummaryLoading(true);

    try {
      // User's suggested logic: Check for advanced scraper first.
      const searchConfig = await getSearchEngineConfig();
      const hasAdvancedScraper = searchConfig && searchConfig.engine !== 'default' && searchConfig.apiKey;

      if (hasAdvancedScraper) {
        // If configured, let handleSend do the scraping with the advanced scraper.
        setShowQuickSummary(false);
        handleSend(`${FAST_SUMMARY_PROMPT} ${quickSummaryUrl}`);
        setIsQuickSummaryLoading(false);
        return;
      }
      
      // Fallback to built-in DOM scraper if no advanced scraper is configured.
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (!tab || !tab.id) { setIsQuickSummaryLoading(false); return; }
          const urlForSummary = tab.url || quickSummaryUrl || '';
          chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (response) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              setIsQuickSummaryLoading(false);
              return;
            }
            // If YouTube, load context and send
            if (response && response.type === 'youtube') {
              setYoutubeInfo(response);
              setShowQuickSummary(false);
              setTimeout(() => { handleSend(`${FAST_SUMMARY_PROMPT} ${response.url || urlForSummary}`); setIsQuickSummaryLoading(false); }, 50);
              return;
            }

            // Regular page: convert to Markdown and attach as scraped URL context
            const pageTitle = (response && response.title) || document.title;
            const pageUrl = (response && response.url) || urlForSummary;
            const pageContent = (response && response.content) || '';

            try {
              const turndown = new TurndownService();
              // Convert plain text to minimal HTML with line breaks for better markdown output
              const safeHtml = `<div>${String(pageContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`;
              const markdown = turndown.turndown(safeHtml);

              // Split into chunks (~4000 chars) for context
              const CHUNK_SIZE = 4000;
              const chunks = [];
              for (let i = 0; i < markdown.length; i += CHUNK_SIZE) {
                chunks.push({ text: markdown.slice(i, i + CHUNK_SIZE) });
              }

              setScrapedUrlContent({ url: pageUrl, title: pageTitle, content: markdown });
              setScrapedUrlChunks(chunks);
              setShowQuickSummary(false);
              setTimeout(() => { handleSend(`${FAST_SUMMARY_PROMPT} ${pageUrl}`); setIsQuickSummaryLoading(false); }, 50);
            } catch (e) {
              setIsQuickSummaryLoading(false);
            }
          });
        });
      } else {
        setIsQuickSummaryLoading(false);
      }
    } catch (_) {
      setIsQuickSummaryLoading(false);
    }
  };

  const dismissQuickSummary = useCallback((e) => {
    try { if (e && e.stopPropagation) e.stopPropagation(); } catch (_) {}
    quickSummaryDismissedRef.current = true;
    setShowQuickSummary(false);
  }, []);

  useEffect(() => {
    // Check if conversation.id exists and has changed to reset context
    if (conversation?.id) {
      if (conversation.messages?.length > 0) {
        setMessages(conversation.messages);
      } else {
        setMessages([{ role: "system", content: WELCOME_MESSAGE }]);
      }
      // Reset other context states as well
      setUploadedFile(null);
      setUploadedImageUrl(null);
      setUploadedImageBase64(null);
      setDocumentFile(null);
      setDocumentContent(null);
      setScrapedUrlContent(null);
      setScrapedUrlChunks([]);
      setYoutubeInfo(null); // Clear YouTube info on new/changed conversation
      setBlockYoutubeDetection(false); // Re-enable YouTube detection for new conversation
      // Clear from session storage if it exists for YouTube
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('youtubeVideoContext');
      }
      
      // Reset YouTube detection flag for new conversation
      youtubeDetectionAttempted.current = null;
      
      // Attempt YouTube detection once for this new conversation
      setTimeout(() => {
        if (youtubeDetectionAttempted.current !== conversation.id && !blockYoutubeDetection) {
          youtubeDetectionAttempted.current = conversation.id;
          
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  { action: "getPageContent" },
                  function (response) {
                    if (chrome.runtime.lastError) {
                      return;
                    }
                    if (response && response.type === 'youtube') {
                      console.log('Detected YouTube video, loading context:', response);
                      setYoutubeInfo(response);
                      setMessages(prev => {
                        const hasYouTubeMessage = prev.some(msg => msg.role === 'system' && msg.content.startsWith('YouTube video detected:'));
                        if (!hasYouTubeMessage) {
                          return [
                            ...prev,
                            { role: "system", content: `YouTube video detected: "${response.title}". Ask questions about this video!` }
                          ];
                        }
                        return prev;
                      });
                    }
                  }
                );
              }
            });
          }
        }
      }, 100); // Small delay to ensure conversation state is settled

      // Quick Summary pill visibility per conversation:
      const isBrandNewChat = !(conversation.messages?.length > 0);
      if (isBrandNewChat) {
        // Re-enable pill on brand new chat only
        quickSummaryDismissedRef.current = false;
        try {
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const tab = tabs && tabs[0];
              const url = tab && tab.url;
              if (!quickSummaryDismissedRef.current && url && /^https?:\/\//i.test(url)) {
                setQuickSummaryUrl(url);
                setShowQuickSummary(true);
              }
            });
          }
        } catch (_) {}
      } else {
        // Hide on existing chats
        setShowQuickSummary(false);
      }
      
    } else if (!conversation) {
      setMessages([{ role: "system", content: WELCOME_MESSAGE }]);
      setUploadedFile(null);
      setUploadedImageUrl(null);
      setUploadedImageBase64(null);
      setDocumentFile(null);
      setDocumentContent(null);
      setActiveChunkIndex(0);
      setScrapedUrlContent(null);
      setScrapedUrlChunks([]);
      setYoutubeInfo(null);
      setBlockYoutubeDetection(false);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('youtubeVideoContext');
      }
      setFirstMessageSent(false); // Ensure welcome message can show
      
      // Reset YouTube detection flag for new conversation
      youtubeDetectionAttempted.current = null;
      
      // Attempt YouTube detection once for this new conversation
      setTimeout(() => {
        if (youtubeDetectionAttempted.current !== 'new-conversation' && !blockYoutubeDetection) {
          youtubeDetectionAttempted.current = 'new-conversation';
          
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  { action: "getPageContent" },
                  function (response) {
                    if (chrome.runtime.lastError) {
                      return;
                    }
                    if (response && response.type === 'youtube') {
                      console.log('Detected YouTube video, loading context:', response);
                      setYoutubeInfo(response);
                      setMessages(prev => {
                        const hasYouTubeMessage = prev.some(msg => msg.role === 'system' && msg.content.startsWith('YouTube video detected:'));
                        if (!hasYouTubeMessage) {
                          return [
                            ...prev,
                            { role: "system", content: `YouTube video detected: "${response.title}". Ask questions about this video!` }
                          ];
                        }
                        return prev;
                      });
                    }
                  }
                );
              }
            });
          }
        }
      }, 100); // Small delay to ensure conversation state is settled

      // Treat no conversation as a new context; re-enable pill
      quickSummaryDismissedRef.current = false;
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            const url = tab && tab.url;
            if (!quickSummaryDismissedRef.current && url && /^https?:\/\//i.test(url)) {
              setQuickSummaryUrl(url);
              setShowQuickSummary(true);
            }
          });
        }
      } catch (_) {}
    }
  }, [conversation?.id]); // Rely only on conversation.id for resetting messages and context




  useEffect(() => {
    // Only auto-scroll if not streaming and user is near bottom
    if (!isStreaming && isNearBottom) {
      scrollToBottom();
    }
  }, [messages, isStreaming, isNearBottom]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (onUpdateConversation && conversation?.id && messages.length > 0) {
        const currentMessagesJSON = JSON.stringify(
          messages.filter(msg => msg.role !== 'system' ||
            (msg.role === 'system' && !msg.content.startsWith('Welcome to the Chat Box!')))
        );
        const conversationMessagesJSON = JSON.stringify(
          (conversation?.messages || []).filter(msg => msg.role !== 'system' ||
            (msg.role === 'system' && !msg.content.startsWith('Welcome to the Chat Box!')))
        );

        if (currentMessagesJSON !== conversationMessagesJSON) {
          onUpdateConversation({ ...conversation, messages });
        }
      }
    }, 500); // Debounce by 500ms

    return () => {
      clearTimeout(handler);
    };
  }, [messages, onUpdateConversation, conversation]);

  // Set up scroll event listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Hide scroll button when streaming ends and user is at bottom
  useEffect(() => {
    if (!isStreaming && isNearBottom) {
      setShowScrollToBottom(false);
    }
  }, [isStreaming, isNearBottom]);

  useEffect(() => {
    const handleMessage = (message, sender, sendResponse) => {
      if (message.type === 'SET_SELECTED_TEXT') {
        setTimeout(() => {
          setSelectedText(message.text);
        }, 700);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
        setIsModelDropdownOpen(false);
      }
      if (fileDropdownRef.current && !fileDropdownRef.current.contains(event.target)) {
        setIsFileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || isStreaming) return;

    const container = messagesContainerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Check if user is near the bottom (within 100px)
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    setIsNearBottom(isNearBottom);

    // Show scroll to bottom button if user scrolled up and not near bottom
    setShowScrollToBottom(!isNearBottom && scrollTop > 50);
  }, [isStreaming]);

  const detectUrls = (text) => {
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
    return text.match(urlRegex) || [];
  };

  const isValidUrl = (urlString) => {
    try {
      if (urlString.startsWith('www.')) {
        urlString = `http://${urlString}`;
      }
      const url = new URL(urlString);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (e) {
      return false;
    }
  };

  const scrapeUrlContent = async (url) => {
    try {
      setIsScrapingUrl(true);
      setMessages(prev => [...prev, { role: "system", content: `Preparing to scrape web page: ${url}...` }]);

      // Use the new urlScraper utility
      const result = await scrapeMultipleUrls([url], {}, (progress) => {
        if (progress.status === 'scraping') {
          setMessages(prev => [
            ...prev.filter(m => !(m.role === 'system' && m.content.startsWith('Preparing to scrape'))),
            { role: "system", content: `Scraping web page: ${url}...` }
          ]);
        }
      });

      if (!result.success) {
        throw new Error(result.errors?.[0]?.error || 'Failed to scrape URL');
      }

      const scrapeResult = result.results[0];
      const chunks = result.chunks;

      // Process the content for the UI
      setScrapedUrlContent({
        url: scrapeResult.url,
        title: scrapeResult.title,
        content: scrapeResult.content
      });
      setScrapedUrlChunks(chunks);

      setMessages(prev => [
        ...prev.filter(m => !(m.role === 'system' && m.content.includes('scrape web page'))),
        {
          role: "system",
          content: `Web page scraped: ${scrapeResult.title} (${scrapeResult.url})\nContent split into ${chunks.length} chunks for analysis.`
        }
      ]);

      return {
        success: true,
        chunks,
        url: scrapeResult.url,
        title: scrapeResult.title,
        engine: result.engine || 'unknown'
      };

    } catch (error) {
      console.error('Error scraping URL:', error);
      setMessages(prev => [
        ...prev.filter(m => !(m.role === 'system' && (m.content.includes('scrape web page') || m.content.startsWith('Preparing to scrape')))),
        { role: "system", content: `Error scraping URL: ${error.message}` }
      ]);
      return { success: false, error: error.message };
    } finally {
      setIsScrapingUrl(false);
    }
  };


  const removeScrapedContent = (url) => {
    if (!url) {
      setScrapedUrlContent(null);
      setScrapedUrlChunks([]);
      setMessages(prev => [
        ...prev,
        { role: "system", content: "All scraped web content has been removed." }
      ]);
      return;
    }
    if (scrapedUrlContent && (scrapedUrlContent.url === url || scrapedUrlContent.url === `http://${url}`)) {
      setScrapedUrlContent(null);
      setScrapedUrlChunks([]);
      setMessages(prev => [
        ...prev,
        { role: "system", content: `Scraped content from ${url} has been removed.` }
      ]);
    }
  };

  // Enhanced function to get AI-suggested search query
  const getAISuggestedSearchQuery = async (userInput, conversationHistory) => {
    if (!apiKey || !endpoint) {
      console.warn("API key or endpoint not configured for AI search suggestion.");
      return null;
    }

    const relevantHistory = conversationHistory
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .slice(-4)
      .map(msg => {
        let contentText = "";
        if (typeof msg.content === 'string') {
          contentText = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textPart = msg.content.find(part => part.type === 'text');
          contentText = textPart ? textPart.text : '[non-text content]';
        }
        return `${msg.role}: ${contentText.substring(0, 150)}${contentText.length > 150 ? '...' : ''}`;
      })
      .join('\n');

    const prompt = `Your task is to refine a user's search query based on their latest input and recent conversation.
User's Latest Query: "${userInput}"
Recent Conversation History:
${relevantHistory || "No recent history."}

Instructions for AI:
1. Analyze the query and history to understand the user's core search intent.
2. Generate an improved, concise, and effective search query.
3. YOUR ENTIRE RESPONSE MUST BE ONLY THE SUGGESTED SEARCH QUERY.
   - Do NOT include any explanations, apologies, or conversational prefixes (e.g., "Here is the query:", "Suggested Query:").
   - Do NOT use quotation marks around the query in your response.
   - If the original query is already optimal or cannot be reliably improved, return the original query.
   - The response should be a single line of text suitable for direct use in a search engine.

Refined Search Query (your entire response):`;

    const messagesForAISuggestion = [{ role: "user", content: prompt }];

    const completionUrl = endpoint.endsWith('/')
      ? `${endpoint}chat/completions`
      : `${endpoint}/chat/completions`;

    try {
      const modelToUse = model || "Default";
      const response = await fetch(completionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: messagesForAISuggestion,
          max_tokens: 70, // Slightly more tokens in case query is long
          temperature: 0.1, // Very low temperature for deterministic query output
          stream: false
        })
      });

      const data = await response.json();

      if (data.error) {
        console.error("Error getting AI suggested search query:", data.error.message);
        setMessages(prev => [...prev, { role: "system", content: `⚠️ AI query analysis error: ${data.error.message}. Using original query.` }]);
        return null;
      }

      let suggestedQuery = data.choices?.[0]?.message?.content?.trim();

      if (suggestedQuery) {
        // If AI gives a multi-line response, try to get the last non-empty line.
        const lines = suggestedQuery.split('\n');
        const lastNonEmptyLine = lines.filter(line => line.trim() !== '').pop();
        if (lastNonEmptyLine) {
          suggestedQuery = lastNonEmptyLine.trim();
        }

        // Remove common unwanted prefixes (case-insensitive)
        const prefixesToRemove = [
          "refined search query:", "improved search query:",
          "suggested search query:", "search query:", "query:",
          "here's the refined query:", "here is the refined query:",
          "here's the suggested query:", "here is the suggested query:",
          "here's the query:", "here is the query:",
          "i suggest searching for:", "try searching for:"
        ];
        for (const prefix of prefixesToRemove) {
          if (suggestedQuery.toLowerCase().startsWith(prefix)) {
            suggestedQuery = suggestedQuery.substring(prefix.length).trim();
          }
        }

        // Remove leading/trailing quotes
        if ((suggestedQuery.startsWith('"') && suggestedQuery.endsWith('"')) ||
          (suggestedQuery.startsWith("'") && suggestedQuery.endsWith("'"))) {
          suggestedQuery = suggestedQuery.substring(1, suggestedQuery.length - 1);
        }

        // Remove trailing punctuation that isn't typically part of a search query
        suggestedQuery = suggestedQuery.replace(/[.,;!?]$/, '');

        // If the cleaning results in an empty string, it's better to return null (original query will be used)
        if (!suggestedQuery.trim()) {
          return null;
        }

        return suggestedQuery;
      }
      return null;

    } catch (error) {
      console.error("Network error in getAISuggestedSearchQuery:", error);
      setMessages(prev => [...prev, { role: "system", content: `⚠️ Network error during AI query analysis: ${error.message}. Using original query.` }]);
      return null;
    }
  };


  const fetchStreamingResponse = async (messagesToSend) => {
    if (!apiKey || !endpoint) {
      return { error: "API key or endpoint not configured" };
    }
    const completionUrl = endpoint.endsWith('/')
      ? `${endpoint}chat/completions`
      : `${endpoint}/chat/completions`;
    try {
      // Create a new AbortController for this streaming request
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      let messagesWithContext = [...messagesToSend]; // Make a mutable copy
      if (youtubeInfo && youtubeInfo.videoId) {
        let transcriptText = "Transcript not available.";
        try {
          console.log(`Fetching transcript for video ID: ${youtubeInfo.videoId}`);
          const transcript = await YoutubeTranscript.fetchTranscript(youtubeInfo.videoId);
          if (transcript && transcript.length > 0) {
            transcriptText = transcript.map(item => item.text).join(" ");
            console.log(`Transcript fetched successfully, length: ${transcriptText.length}`);
          } else {
            console.log('Transcript was empty or not found.');
          }
        } catch (error) {
          console.error("Error fetching YouTube transcript:", error);
          if (error.message && error.message.includes('transcripts disabled')) {
            transcriptText = "Transcripts are disabled for this video.";
          } else if (error.message && error.message.includes('no transcript found')) {
            transcriptText = "No transcript found for this video.";
          } else {
            transcriptText = "Could not retrieve transcript.";
          }
        }

        const MAX_CHUNK_SIZE = 3000; // characters
        let formattedTranscript = "";
        if (!transcriptText || transcriptText.trim() === "" || transcriptText === "Transcript not available." || transcriptText === "Transcripts are disabled for this video." || transcriptText === "No transcript found for this video." || transcriptText === "Could not retrieve transcript.") {
          formattedTranscript = transcriptText; // Keep error/empty messages as is
        } else if (transcriptText.length <= MAX_CHUNK_SIZE) {
          formattedTranscript = transcriptText;
        } else {
          const numChunks = Math.ceil(transcriptText.length / MAX_CHUNK_SIZE);
          const chunksArray = [];
          for (let i = 0; i < transcriptText.length; i += MAX_CHUNK_SIZE) {
            chunksArray.push(transcriptText.substring(i, i + MAX_CHUNK_SIZE));
          }
          formattedTranscript = chunksArray.map((chunk, index) => `Transcript Chunk ${index + 1}/${numChunks}:\n${chunk}`).join("\n\n");
        }

        let youtubeContext = `System Note: The user is likely asking about the YouTube video titled "${youtubeInfo.title}".
Channel: ${youtubeInfo.channel || 'Unknown'}.
Video ID: ${youtubeInfo.videoId}.
${youtubeInfo.description ? `Video Description (partial): ${youtubeInfo.description.substring(0, 300)}${youtubeInfo.description.length > 300 ? '...' : ''}\n` : ''}
${youtubeInfo.stats ? `Video Stats: ${youtubeInfo.stats}\n` : ''}
Video Transcript:\n${formattedTranscript}
Consider this YouTube video context when responding.`;

        // Insert YouTube context as a system message before the last user message or at the start
        const lastUserMsgIndex = messagesWithContext.map(m => m.role).lastIndexOf('user');
        if (lastUserMsgIndex > -1) {
          messagesWithContext.splice(lastUserMsgIndex, 0, { role: 'system', content: youtubeContext });
        } else {
          // If no user message (e.g., only system messages), add to the start
          messagesWithContext.unshift({ role: 'system', content: youtubeContext });
        }
      }

      const filteredMessages = messagesWithContext.map(msg => {
        if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

        const hasBlobImage = msg.content.some(item => item.type === 'image_url' && item.image_url?.url?.startsWith('blob:'));
        if (!hasBlobImage) return msg; // No blob image, return as is

        // If there's a blob image, only keep text parts for history to avoid sending blob URLs
        const textParts = msg.content.filter(item => item.type === 'text');
        if (textParts.length > 0) {
          return { role: 'user', content: textParts.map(item => item.text).join('\n') };
        }
        // If only an image was sent with no text, use a placeholder for history
        return { role: 'user', content: '[User sent an image]' };

      }).filter(msg => // Filter out initial welcome message and other non-essential system messages
        !(msg.role === "system" && msg.content.startsWith("Welcome to the Chat Box!")) &&
        !(msg.role === "system" && msg.content.startsWith("Error scraping URL:")) && // Don't send scraping errors to AI
        !(msg.role === "system" && msg.content.startsWith("Scraping web page:")) &&
        !(msg.role === "system" && msg.content.startsWith("🧠 Analyzing")) && // Don't send analysis status
        !(msg.role === "system" && msg.content.startsWith("✅ AI analysis complete")) &&
        !(msg.role === "system" && msg.content.startsWith("🔍 AI suggested search")) &&
        !(msg.role === "system" && msg.content.startsWith("✅ Found")) && // Don't send search result count
        !(msg.role === "system" && msg.content.startsWith("⚠️ No search results found")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Error during AI query analysis")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Network error during AI query analysis"))
      );


      const modelToUse = model || "Default";
      // Try SDK path for specific providers
      const sdkProvider = detectSdkProvider({ endpoint, providerHint: provider });
      if (sdkProvider === 'openai' || sdkProvider === 'anthropic' || sdkProvider === 'ollama' || sdkProvider === 'cerebras') {
        try {
          const { stream } = await streamChatViaSDK({ provider: sdkProvider, apiKey, endpoint, model: modelToUse, messages: filteredMessages, abortSignal: signal });
          if (stream) return { stream };
        } catch (e) {
          // Fall through to REST below
        }
      }

      // REST fallback (OpenAI-compatible)
      const response = await fetch(completionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelToUse, messages: filteredMessages, max_tokens: 2000, temperature: 0.5, stream: true }),
        signal
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        return { error: errorData.error?.message || `HTTP Error: ${response.status}` };
      }
      return { stream: response.body };
    } catch (error) {
      console.error("Error in fetchStreamingResponse:", error);
      return { error: `API communication error: ${error.message}` };
    }
  };

  const stopStreamingResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("Stream aborted by user");
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsStreaming(false);
  };

  const processStream = async (stream, initialMessagesSnapshot, meta = {}) => {
    if (!stream) return;
    const reader = stream.getReader();
    let accumulatedContent = "";
    // Add a placeholder for the streaming AI response immediately
    // Use the snapshot of messages *before* this response started
    setMessages([...initialMessagesSnapshot, { role: "assistant", content: "", model: meta.model || model || null, provider: meta.providerName || null }]);

    try {
      setIsLoading(true); // Should already be true, but ensure
      setIsStreaming(true); // Mark that we're actively streaming

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder("utf-8").decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsedData = JSON.parse(data);
              const content = parsedData.choices[0]?.delta?.content || '';
              if (content) {
                accumulatedContent += content;
                // Update the last message (the assistant's streaming response)
                setMessages(prevMessages => {
                  const updatedMessages = [...prevMessages];
                  if (updatedMessages.length > 0 && updatedMessages[updatedMessages.length - 1].role === 'assistant') {
                    const last = updatedMessages[updatedMessages.length - 1];
                    updatedMessages[updatedMessages.length - 1] = { ...last, content: accumulatedContent };
                  }
                  return updatedMessages;
                });
              }
            } catch (err) {
              // console.error('Error parsing SSE data chunk:', err, "Data chunk:", data);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading stream:', error);
      // Don't show error if it was caused by user abort
      if (error.name !== 'AbortError') {
        // Update the last message with an error, or add a new system error message
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === accumulatedContent) { // If stream ended mid-way
            const updated = [...prev];
            updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + `\n[Error reading full stream: ${error.message}]` };
            return updated;
          }
          return [...prev, { role: "system", content: `Error processing stream: ${error.message}` }];
        });
      } else {
        // For abort errors, just update the UI to show streaming was stopped
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages.length > 0 && updatedMessages[updatedMessages.length - 1].role === 'assistant') {
            // Add a small note that the response was stopped
            const last = updatedMessages[updatedMessages.length - 1];
            updatedMessages[updatedMessages.length - 1] = { ...last, content: (last.content || '') + " [Response stopped by user]" };
          }
          return updatedMessages;
        });
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const fetchRegularResponse = async (messagesToSend) => { // Used as fallback
    const completionUrl = endpoint.endsWith('/')
      ? `${endpoint}chat/completions`
      : `${endpoint}/chat/completions`;
    try {
      const filteredMessages = messagesToSend.filter(msg => // Same filtering as fetchStreamingResponse
        !(msg.role === "system" && msg.content.startsWith("Welcome to the Chat Box!")) &&
        !(msg.role === "system" && msg.content.startsWith("Error scraping URL:")) &&
        !(msg.role === "system" && msg.content.startsWith("Scraping web page:")) &&
        !(msg.role === "system" && msg.content.startsWith("🧠 Analyzing")) &&
        !(msg.role === "system" && msg.content.startsWith("✅ AI analysis complete")) &&
        !(msg.role === "system" && msg.content.startsWith("🔍 AI suggested search")) &&
        !(msg.role === "system" && msg.content.startsWith("✅ Found")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ No search results found")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Error during AI query analysis")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Network error during AI query analysis"))
      );

      const modelToUse = model || "Default";
      const providerName = (() => {
        if (availableModels && typeof availableModels === 'object') {
          for (const [prov, list] of Object.entries(availableModels)) {
            if (Array.isArray(list) && list.includes(modelToUse)) return prov;
          }
          const keys = Object.keys(availableModels);
          if (keys.length > 0) return keys[0];
        }
        return null;
      })();
      // Try SDK for supported providers first
      const sdkProvider = detectSdkProvider({ endpoint, providerHint: provider });
      if (sdkProvider === 'openai' || sdkProvider === 'anthropic' || sdkProvider === 'ollama' || sdkProvider === 'cerebras') {
        try {
          const res = await completeOnceViaSDK({ provider: sdkProvider, apiKey, endpoint, model: modelToUse, messages: filteredMessages });
          return { content: res.content, meta: { model: modelToUse, providerName } };
        } catch (e) {
          // fall through to REST
        }
      }

      // REST fallback (OpenAI-compatible)
      const response = await fetch(completionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelToUse, messages: filteredMessages, max_tokens: 2000, temperature: 0.5 })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        return { error: errData.error?.message || `HTTP Error: ${response.status}` };
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return { content, meta: { model: modelToUse, providerName } };
    } catch (error) {
      console.error("Error in fetchRegularResponse:", error);
      return { error: `API communication error: ${error.message}` };
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null; // Allow re-uploading the same file
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setFileUploadError("File size too large (max 10MB)");
      setTimeout(() => setFileUploadError(null), 3000);
      return;
    }
    // Consolidate document type check
    const isDocumentType = type === 'document' || (
      !file.type.startsWith('image/') && (
        file.type === 'application/pdf' ||
        file.type === 'text/plain' ||
        file.type === 'application/msword' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'text/markdown' ||
        file.type === 'text/html' || // Added common code/text file types
        file.type === 'text/css' ||
        file.type === 'application/javascript' ||
        file.type === 'application/json' // Added JSON
      )
    );

    if (isDocumentType) {
      setIsProcessingDocument(true);
      try {
        const documentData = await extractTextFromDocument(file);
        setDocumentFile(file);
        setDocumentContent(documentData);
        setActiveChunkIndex(0);
        const totalChunks = documentData.chunks?.length || 1;
        setMessages(prev => [...prev, { role: "system", content: `Document loaded: ${file.name} (${totalChunks} chunks). You can now chat about this document.` }]);
        // Clear any pending image upload states if a document is uploaded
        setUploadedFile(null); setUploadedImageUrl(null); setUploadedImageBase64(null);
      } catch (error) {
        console.error('Error processing document:', error);
        setFileUploadError(`Failed to process document: ${error.message}`);
        setTimeout(() => setFileUploadError(null), 3000);
      } finally {
        setIsProcessingDocument(false);
      }
    } else if (file.type.startsWith('image/')) {
      const imageId = `img-${Date.now()}-${Math.random()}`;
      const blob = file.slice(0, file.size, file.type);
      await saveImage(imageId, blob);

      setUploadedFile({ file, id: imageId }); // Store file and its new ID
      setDocumentFile(null); setDocumentContent(null); // Clear other file types

      // Create a local URL for immediate preview and revoke any previous one
      if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
      const localUrl = URL.createObjectURL(blob);
      setUploadedImageUrl(localUrl);

      // Also prepare the base64 for the API call
      try {
        const base64 = await fileToBase64(file);
        setUploadedImageBase64(base64);
      } catch (error) {
        console.error('Error converting image to Base64:', error);
        setFileUploadError("Failed to process image for API.");
        setTimeout(() => setFileUploadError(null), 3000);
      }
    } else {
      setFileUploadError(`Unsupported file type: ${file.type || 'Unknown'}`);
      setTimeout(() => setFileUploadError(null), 3000);
      return;
    }
    setIsFileDropdownOpen(false);
    textareaRef.current?.focus();
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('No file provided for Base64 conversion')); return; }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string' && result.startsWith('data:')) {
          resolve(result);
        } else {
          reject(new Error('Invalid data URL format during Base64 conversion'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handlePromptSelect = (prompt) => {
    setInput(prompt.prompt);
    setShowPrompts(false);
    textareaRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (showPrompts && filteredPrompts.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedPromptIndex(prevIndex => (prevIndex + 1) % filteredPrompts.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedPromptIndex(prevIndex => (prevIndex - 1 + filteredPrompts.length) % filteredPrompts.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedPromptIndex >= 0 && selectedPromptIndex < filteredPrompts.length) {
          handlePromptSelect(filteredPrompts[selectedPromptIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowPrompts(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    // Detect URLs in real-time
    const urlsInInput = detectUrls(value);
    const validUrls = urlsInInput.filter(url => isValidUrl(url));
    setDetectedUrls(validUrls);

    if (value.startsWith('/')) {
      const searchTerm = value.substring(1).toLowerCase();
      const filtered = prompts.filter(p => p.command && p.command.toLowerCase().includes(searchTerm));
      setFilteredPrompts(filtered);
      setShowPrompts(filtered.length > 0);
      setSelectedPromptIndex(0); // Reset index on new filter
    } else {
      setShowPrompts(false);
    }
  };

  // Clean up object URLs when component unmounts or when uploadedImageUrl changes
  useEffect(() => {
    const currentUrl = uploadedImageUrl;
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [uploadedImageUrl]);

  const searchWeb = async (queryToSearch) => {
    try {
      // Check for custom search engine configuration first
      const { getSearchEngineConfig, performSearch } = await import('../utils/searchUtils');
      const searchConfig = await getSearchEngineConfig();

      // If a custom search engine (firecrawl or jina) is configured with an API key
      if (searchConfig && (searchConfig.engine === 'firecrawl' || searchConfig.engine === 'jina') && searchConfig.apiKey) {
        try {
          console.log(`Using ${searchConfig.engine} search engine for query:`, queryToSearch);
          const customSearchResults = await performSearch(queryToSearch, { limit: 5 });

          // Format the results to match the expected structure
          let formattedResults = [];

          // Handle different API response structures
          if (searchConfig.engine === 'firecrawl') {
            // Handle Firecrawl response structure
            // Results are in data array for Firecrawl
            const resultsArray = customSearchResults.data || [];

            formattedResults = resultsArray.map(item => {
              // Create a processed content with chunks from markdown
              let processedContent = '';
              const markdown = item.markdown || '';

              // Split markdown into manageable chunks if it's long
              const contentChunks = [];
              const chunkSize = 1000;

              if (markdown.length > chunkSize) {
                for (let i = 0; i < markdown.length; i += chunkSize) {
                  contentChunks.push(markdown.substring(i, i + chunkSize));
                }
                // Use first chunk for snippet, but store all chunks
                processedContent = contentChunks.join('\n--- CHUNK BREAK ---\n');
              } else {
                processedContent = markdown;
              }

              return {
                title: item.title || item.metadata?.title || item.url,
                url: item.url || item.metadata?.sourceURL,
                snippet: item.description || markdown.substring(0, 200),
                fullContent: processedContent,
                contentType: 'markdown'
              };
            });
            console.log('Firecrawl search results processed:', formattedResults.length);

          } else if (searchConfig.engine === 'jina') {
            // Handle Jina response structure
            // Results are in data array for Jina
            const resultsArray = customSearchResults.data || [];

            formattedResults = resultsArray.map(item => {
              // Create a processed content with chunks
              let processedContent = '';
              const content = item.content || '';

              // Split content into manageable chunks if it's long
              const contentChunks = [];
              const chunkSize = 1000;

              if (content.length > chunkSize) {
                for (let i = 0; i < content.length; i += chunkSize) {
                  contentChunks.push(content.substring(i, i + chunkSize));
                }
                // Use first chunk for snippet, but store all chunks
                processedContent = contentChunks.join('\n--- CHUNK BREAK ---\n');
              } else {
                processedContent = content;
              }

              return {
                title: item.title || item.url,
                url: item.url,
                snippet: item.description || content.substring(0, 200),
                fullContent: processedContent,
                contentType: 'text'
              };
            });
            console.log('Jina search results processed:', formattedResults.length);
          }

          return {
            results: formattedResults,
            queryUsed: queryToSearch,
            source: searchConfig.engine
          };
        } catch (customSearchError) {
          console.error(`Error using ${searchConfig.engine} search:`, customSearchError);
          // Fallback to default search if custom search fails
          console.log('Falling back to default search...');
        }
      }

      // Default search with DuckDuckGo if no custom engine or custom search failed
      // console.log('Searching the web with DuckDuckGo for:', queryToSearch);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryToSearch)}`;
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const resultElements = doc.querySelectorAll('.result');
      const results = [];

      if (resultElements.length === 0) {
        // console.log('Could not parse DuckDuckGo results via proxy, using fallback for query:', queryToSearch);
        return {
          results: [
            { title: `Search result for: ${queryToSearch}`, url: `https://duckduckgo.com/?q=${encodeURIComponent(queryToSearch)}`, snippet: `DuckDuckGo search results for "${queryToSearch}". Click to view full results.` },
            { title: `Google search for: ${queryToSearch}`, url: `https://www.google.com/search?q=${encodeURIComponent(queryToSearch)}`, snippet: `Google search results for "${queryToSearch}". This might provide different information.` }
          ],
          queryUsed: queryToSearch,
          source: 'fallback_no_results_parsed'
        };
      }

      resultElements.forEach((el, index) => {
        if (index < 5) { // Limit to 5 results to keep context manageable
          const titleEl = el.querySelector('.result__title a'); // Get the <a> tag directly
          const snippetEl = el.querySelector('.result__snippet');
          const urlText = el.querySelector('.result__url')?.textContent.trim();

          if (titleEl && snippetEl && urlText) {
            results.push({
              title: titleEl.textContent.trim(),
              url: titleEl.href.startsWith('http') ? titleEl.href : `https://${urlText}`, // Prefer href, fallback to constructing from text
              snippet: snippetEl.textContent.trim()
            });
          }
        }
      });
      // console.log('Search results for query:', queryToSearch, results);
      return { results: results, queryUsed: queryToSearch, source: 'duckduckgo_proxy' };
    } catch (error) {
      console.error('Error searching the web for query:', queryToSearch, error);
      // Fallback in case of any error during search
      return {
        results: [
          { title: `Search error for: ${queryToSearch}`, url: `https://duckduckgo.com/?q=${encodeURIComponent(queryToSearch)}`, snippet: `There was an error searching for "${queryToSearch}": ${error.message}. You can try the search directly.` },
          { title: `Try Google search for: ${queryToSearch}`, url: `https://www.google.com/search?q=${encodeURIComponent(queryToSearch)}`, snippet: `Since DuckDuckGo search encountered an error, you might try Google.` }
        ],
        queryUsed: queryToSearch,
        source: 'error_during_search',
        error: error.message
      };
    }
  };

  const handleSend = async (overrideText = null) => {
    if (isLoading) return;
    // ... (rest of the code remains the same)
    const originalInputText = (overrideText !== null && overrideText !== undefined ? overrideText : input).trim(); // Use this for logic, API, etc.
    
    // Prevent sending an empty message
    if (originalInputText === "" && !selectedText && !uploadedFile && !documentFile && !scrapedUrlContent && !youtubeInfo) {
      return;
    }

    // Prevent sending an image without any text context
    if (uploadedFile && uploadedFile.file.type.startsWith('image/') && originalInputText === "" && !selectedText) {
      setMessages(prev => [...prev, { role: "system", content: "Please add a text description or question when uploading an image." }]);
      return;
    }
    
    setIsLoading(true); // Set loading early

    // Capture current messages state *before* adding the new user message for processStream
    const messagesBeforeThisSend = [...messages]; 

    // 
    const uiTextContent = originalInputText;
    let apiTextContent = originalInputText;
    if (selectedText) {
      const formattedSelectedText = `\n\n[Selected Text]:\n${selectedText}`;
      apiTextContent =
        originalInputText
          ? `${originalInputText}${formattedSelectedText}`
          : `[Selected Text]:\n${selectedText}`;
    }

    // --- Prepare User Message for UI and API ---
    let uiUserMessageContent;
    let apiUserMessageContent; // This will be used for the API call

    if (uploadedFile && uploadedFile.file.type.startsWith('image/') && uploadedImageBase64) {
        uiUserMessageContent = [
            { type: "text", text: uiTextContent },
            { type: "image_ref", imageId: uploadedFile.id }
        ];
        apiUserMessageContent = [ // For API
            { type: "text", text: apiTextContent },
            { type: "image_url", image_url: { url: uploadedImageBase64 } }
        ];
    } else if (documentFile) { // If a document is primary context, text might be about it
        uiUserMessageContent = uiTextContent;
        apiUserMessageContent = apiTextContent;
    } else { // Simple text message or text with non-image file (handled by [File attached])
        uiUserMessageContent = uiTextContent + (uploadedFile ? `\n[File attached: ${uploadedFile.file.name}]` : "");
        apiUserMessageContent = apiTextContent + (uploadedFile ? `\n[File attached: ${uploadedFile.file.name}]` : "");
    }
    
    const uiUserMessage = { 
        role: "user", 
        content: uiUserMessageContent,
        selectedText: selectedText // Add selected text as a separate property for UI display
    };
    setMessages(prev => [...prev, uiUserMessage]); // Add user message to UI

    // Clear input and file states *after* preparing message content
    const inputForProcessing = originalInputText; // Save for processing, input state will be cleared
    setInput("");
    const wasFileUploaded = uploadedFile; // Check if a file was part of this send
    setUploadedFile(null);
    // uploadedImageUrl is revoked by its own useEffect when it changes
    // setUploadedImageUrl(null); // Handled by useEffect cleanup
    setUploadedImageBase64(null);
    setSelectedText(null); // Clear selected text after sending
    setDetectedUrls([]); // Clear detected URLs after sending
    if (textareaRef.current) adjustTextareaHeight(); // Reset height based on new empty input


    if (!apiKey || !endpoint) {
        setMessages(prev => [...prev, { role: "system", content: "Please set up your API key and endpoint in the settings panel." }]);
        setIsLoading(false);
        return;
    }

    // --- Build messages for API ---
    // Start with a clean array of historical messages, filtering out non-API system messages
    let messagesToSendToAPI = messagesBeforeThisSend.filter(msg =>
        !(msg.role === "system" && msg.content.startsWith("Error scraping URL:")) &&
        !(msg.role === "system" && msg.content.startsWith("Scraping web page:")) &&
        !(msg.role === "system" && msg.content.startsWith("🧠 Analyzing")) &&
        !(msg.role === "system" && msg.content.startsWith("✅ AI analysis complete")) &&
        !(msg.role === "system" && msg.content.startsWith("🔍 AI suggested search")) &&
        !(msg.role === "system" && msg.content.startsWith("✅ Found")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ No search results found")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Error during AI query analysis")) &&
        !(msg.role === "system" && msg.content.startsWith("⚠️ Network error during AI query analysis"))
    );

  // --- Transform image_ref to image_url for API history ---
  messagesToSendToAPI = await Promise.all(
    messagesToSendToAPI.map(async (msg) => {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const newContent = await Promise.all(
          msg.content.map(async (part) => {
            if (part.type === 'image_ref' && part.imageId) {
              try {
                const blob = await getImage(part.imageId);
                if (blob) {
                  const base64Url = await fileToBase64(blob);
                  return { type: 'image_url', image_url: { url: base64Url } };
                }
                return null; // Image not found in DB
              } catch (error) {
                console.error(`Failed to convert image ${part.imageId} to base64:`, error);
                return null; // Conversion failed
              }
            }
            return part;
          })
        );
        const filteredContent = newContent.filter(Boolean);
        return { ...msg, content: filteredContent };
      }
      return msg;
    })
  );

    // Add Document Context if available
    if (documentFile && documentContent?.chunks && documentContent.chunks.length > 0) {
        let fullDocumentText = "";
        documentContent.chunks.forEach((chunk, index) => {
            fullDocumentText += `--- Chunk ${index + 1} of ${documentContent.chunks.length} ---
${chunk.text}

`;
        });
        // Remove the last two newlines for cleaner formatting if fullDocumentText is not empty
        if (fullDocumentText.length > 0) {
            fullDocumentText = fullDocumentText.slice(0, -2);
        }

        const documentContextMessage = {
            role: "system",
            content: `The user has uploaded a document named "${documentFile.name}". Use the following content to answer the user's question:\n\n${fullDocumentText}`
        };
        messagesToSendToAPI.unshift(documentContextMessage);
    }

    // Add Scraped URL Context if available (takes precedence if both doc and URL are somehow active)
    if (scrapedUrlContent && scrapedUrlChunks.length > 0) {
        const allChunksText = scrapedUrlChunks.map(c => c.text).join("\n\n---\n\n");
        const urlContextInfo = `System Note: The user is likely discussing the scraped web page "${scrapedUrlContent.title}" (${scrapedUrlContent.url}). Full web page content:\n\n${allChunksText}`;
        messagesToSendToAPI.push({ role: "system", content: urlContextInfo });
    }


    // --- Handle URL Commands / Detection (if not a file upload scenario primarily) ---
    // This logic might need refinement if a URL is *in addition* to a file upload
    const detectedUrlsInInput = detectUrls(inputForProcessing);
    // Match URL commands with multiple URLs: [command url1 and url2] or [command url1, url2]
    const urlCommandMatch = inputForProcessing.match(/^\[(summary|summarize|analyze|scrape)\s+(.+?)\]$/i);
    let urlToProcess = null;
    let isUrlCommand = false;
    let urlCommandAction = "analyze"; // Default action

    if (urlCommandMatch) {
        urlCommandAction = urlCommandMatch[1].toLowerCase();
        const urlText = urlCommandMatch[2];

        // Extract all URLs from the command text
        const urlsInCommand = detectUrls(urlText).filter(url => isValidUrl(url));
        if (urlsInCommand.length > 0) {
            urlToProcess = urlsInCommand.length === 1 ? urlsInCommand[0] : urlsInCommand;
            isUrlCommand = true;
        }
    } else if (detectedUrlsInInput.length > 0 && !wasFileUploaded) { // Only auto-scrape if no file was uploaded with this message
        // Process all detected URLs for general queries
        const validUrls = detectedUrlsInInput.filter(url => isValidUrl(url)).slice(0, 3); // Limit to 3 URLs to avoid overwhelming
        if (validUrls.length > 0) {
            urlToProcess = validUrls; // Array of URLs for multi-URL processing
        }
    }

    // Handle URL processing (single URL command or multiple auto-detected URLs)
    let urlsToProcess = [];
    if (urlToProcess) {
        urlsToProcess = Array.isArray(urlToProcess) ? urlToProcess : [urlToProcess];
    }

    if (urlsToProcess.length > 0) {
        // Add the user's original message that contained the URL/command to the API messages
        messagesToSendToAPI.push({ role: "user", content: inputForProcessing });

        // If only one URL, use single-URL flow for clearer UX and messages
        if (urlsToProcess.length === 1) {
            const singleUrl = urlsToProcess[0];
            setMessages(prev => [...prev, { role: "system", content: `🔍 Processing URL: ${singleUrl}...` }]);

            const singleResult = await scrapeUrlContent(singleUrl);

            if (singleResult.success && singleResult.chunks && singleResult.chunks.length > 0) {
                const allChunksText = singleResult.chunks.map(c => c.text).join("\n\n---\n\n");
                const urlContextForAI = `System Note: The user has requested to process the URL: ${singleResult.title} (${singleResult.url}).\nAction: ${isUrlCommand ? urlCommandAction : 'general query about URL'}.\nFull web page content:\n${allChunksText}`;
                messagesToSendToAPI.push({ role: "system", content: urlContextForAI });
            } else {
                const errorMessage = `⚠️ Failed to scrape URL: ${singleUrl}`;
                setMessages(prev => [...prev, { role: "system", content: errorMessage }]);
                messagesToSendToAPI.push({ role: "system", content: errorMessage });
            }

        } else {
            // Show initial progress message for multiple URLs
            setMessages(prev => [...prev, {
                role: "system",
                content: `🔍 Processing ${urlsToProcess.length} URLs...`
            }]);

            try {
                // Use the new urlScraper utility to process multiple URLs at once
                const scrapeResults = await scrapeMultipleUrls(urlsToProcess, {}, (progress) => {
                    setMessages(prev => [
                        ...prev.filter(m => !(m.role === 'system' && (m.content.includes('Processing') || m.content.includes('Scraping')))),
                        {
                            role: "system",
                            content: `🔍 Processing URLs: ${progress.current}/${progress.total} completed`
                        }
                    ]);
                });

                // Process successful results
                if (scrapeResults.success && scrapeResults.chunks && scrapeResults.chunks.length > 0) {
                    const allChunksText = scrapeResults.chunks.map(c => c.text).join("\n\n---\n\n");

                    // Create context message mentioning all processed URLs
                    const processedUrls = scrapeResults.results
                        .filter(r => r.success)
                        .map(r => `${r.title} (${r.url})`)
                        .join(', ');

                    const urlContextForAI = `System Note: The user has requested to process ${urlsToProcess.length} URL(s): ${processedUrls}.
Action: ${isUrlCommand ? urlCommandAction : 'general query about URLs'}.
Successfully processed ${scrapeResults.successfulUrls}/${scrapeResults.totalUrls} URLs.
Full web page content:\n${allChunksText}`;

                    messagesToSendToAPI.push({ role: "system", content: urlContextForAI });

                    // Update UI with final success message
                    setMessages(prev => [
                        ...prev.filter(m => !(m.role === 'system' && (m.content.includes('Processing') || m.content.includes('Scraping')))),
                        {
                            role: "system",
                            content: `✅ Successfully scraped ${scrapeResults.successfulUrls}/${scrapeResults.totalUrls} URLs. Content split into ${scrapeResults.chunks.length} chunks for analysis.`
                        }
                    ]);

                    // Set the scraped content for the UI (use the combined content)
                    if (scrapeResults.successfulUrls > 0) {
                        const firstSuccessful = scrapeResults.results.find(r => r.success);
                        setScrapedUrlContent({
                            url: firstSuccessful.url,
                            title: `Multiple URLs (${scrapeResults.successfulUrls} processed)`,
                            content: scrapeResults.content
                        });
                        setScrapedUrlChunks(scrapeResults.chunks);
                    }
                }

                // Handle failed URLs
                if (scrapeResults.failedUrls > 0) {
                    const failedUrls = scrapeResults.errors.map(e => e.url).join(', ');
                    const errorMessage = `⚠️ Failed to scrape ${scrapeResults.failedUrls} URL(s): ${failedUrls}`;
                    setMessages(prev => [...prev, { role: "system", content: errorMessage }]);
                    messagesToSendToAPI.push({ role: "system", content: errorMessage });
                }

            } catch (error) {
                console.error('Error in multi-URL scraping:', error);
                const errorMessage = `❌ Error processing URLs: ${error.message}`;
                setMessages(prev => [...prev, { role: "system", content: errorMessage }]);
                messagesToSendToAPI.push({ role: "system", content: errorMessage });
            }
        }

        // The user's original message is already in messagesToSendToAPI
        // The AI will see all URL contexts and then the user's message
    } else if (searchEnabled && typeof inputForProcessing === 'string' && inputForProcessing) {
        // --- AI Enhanced Search (only if not a URL command and search is enabled) ---
        let currentSearchSystemMessage = `🧠 Analyzing your query with AI to improve search for: "${inputForProcessing}"...`;
        setMessages(prev => [...prev, { role: "system", content: currentSearchSystemMessage }]);
        
        const aiSuggestedQuery = await getAISuggestedSearchQuery(inputForProcessing, messagesBeforeThisSend); // Use history before this send
        let queryToSearch = inputForProcessing; // Default to original input

        if (aiSuggestedQuery && aiSuggestedQuery.toLowerCase() !== inputForProcessing.toLowerCase()) {
            queryToSearch = aiSuggestedQuery;
            currentSearchSystemMessage = `🔍 AI suggested search: "${queryToSearch}". Searching... (Original: "${inputForProcessing}")`;
        } else {
            currentSearchSystemMessage = `✅ AI analysis complete. Searching for: "${inputForProcessing}"...`;
        }
        
        // Update the last system message in UI
        setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsgIdx = newMsgs.length -1;
            if (lastMsgIdx >=0 && newMsgs[lastMsgIdx].role === 'system' && newMsgs[lastMsgIdx].content.startsWith("🧠 Analyzing")) {
                newMsgs[lastMsgIdx].content = currentSearchSystemMessage;
                return newMsgs;
            }
            // This path should ideally not be hit if message was added correctly
            return [...prev, {role: "system", content: currentSearchSystemMessage}];
        });

        const searchResultsData = await searchWeb(queryToSearch);
        
        if (searchResultsData.results && searchResultsData.results.length > 0) {
            const searchResultsText = searchResultsData.results.map((result, index) =>
                `[${index + 1}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}\nContent: ${result.fullContent}`
            ).join('\n');
            
            const queryInfoMessageForUI = `✅ Found ${searchResultsData.results.length} results for "${searchResultsData.queryUsed}".`;
            setMessages(prev => [...prev, { role: "system", content: queryInfoMessageForUI }]);

            const contextualInfoForAI = aiSuggestedQuery && aiSuggestedQuery.toLowerCase() !== inputForProcessing.toLowerCase() ?
                `System Note: The original user query was "${inputForProcessing}". It was refined by AI to "${searchResultsData.queryUsed}" for web search.` :
                `System Note: Web search was performed for the user query "${searchResultsData.queryUsed}".`;
            
            messagesToSendToAPI.push({
                role: "system",
                content: `${contextualInfoForAI}\n\nWeb search results provided below. Use these results to answer the user's original query:\n\n${searchResultsText}`
            });
        } else {
            setMessages(prev => [...prev, { role: "system", content: `⚠️ No search results found for "${searchResultsData.queryUsed}". The AI will respond based on its general knowledge.` }]);
        }
        // Add the original user message (with potentially Base64 image) for the API
        messagesToSendToAPI.push({role: "user", content: apiUserMessageContent});
    } else {
        // Default: Add the user's message (text or multipart with image) if not a URL command and not searching
         messagesToSendToAPI.push({role: "user", content: apiUserMessageContent});
    }


    // --- Fetch AI Response ---
    // Use the messages state *before this send operation* for the snapshot for processStream,
    // because processStream will add the assistant message to this snapshot.
    // The `uiUserMessage` is already added to the main `messages` state for UI.
    const snapshotForStream = [...messagesBeforeThisSend, uiUserMessage];

    const streamResult = await fetchStreamingResponse(messagesToSendToAPI);
    if (streamResult.stream) {
        const providerName = (() => {
          if (availableModels && typeof availableModels === 'object') {
            for (const [prov, list] of Object.entries(availableModels)) {
              if (Array.isArray(list) && list.includes(model || "Default")) return prov;
            }
            const keys = Object.keys(availableModels);
            if (keys.length > 0) return keys[0];
          }
          return null;
        })();
        await processStream(streamResult.stream, snapshotForStream, { model: model || "Default", providerName });
    } else { 
        // Fallback to regular response if streaming failed or returned an error object
        setMessages(prev => [...prev, {role: "system", content: `Streaming failed: ${streamResult.error || 'Unknown error'}. Attempting regular response...`}]);
        const regularResult = await fetchRegularResponse(messagesToSendToAPI);
        if (regularResult.error) {
            setMessages(prev => [...prev, { role: "system", content: `Error: ${regularResult.error}` }]);
        } else if (regularResult.content) {
            setMessages(prev => [...prev, { role: "assistant", content: regularResult.content, model: regularResult.meta?.model || model || null, provider: regularResult.meta?.providerName || null }]);
        }
        setIsLoading(false); // Ensure loading is false on fallback
    }
    // setIsLoading(false); // isLoading is set to false inside processStream or after fallback
  };

  const handleRedoMessage = async (messageToRedo) => {
    if (!apiKey || !endpoint) {
      setMessages(prev => [...prev, { role: "system", content: "Please set up API key and endpoint to regenerate response." }]);
      return;
    }
    // Find the index of the message to redo
    const messageIndex = messages.findIndex(msg => msg === messageToRedo); // Compare by object reference
    if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') return;

    // Get all messages up to *but not including* the assistant message to redo.
    // The AI will then generate a new response based on this history.
    const historyForRedo = messages.slice(0, messageIndex);

    // Check if the history is not empty and the last message is a user query or relevant context
    if (historyForRedo.length === 0) {
      setMessages(prev => [...prev, { role: "system", content: "Cannot regenerate response without prior context." }]);
      return;
    }

    // Prepare messages for API, including active context
    let messagesToSendToAPI = [...historyForRedo];

    // Add Scraped URL Context if available
    if (scrapedUrlContent && scrapedUrlChunks.length > 0) {
      const allChunksText = scrapedUrlChunks.map(c => c.text).join("\n\n---\n\n");
      const urlContextInfo = `System Note: The user is likely discussing the scraped web page "${scrapedUrlContent.title}" (${scrapedUrlContent.url}). Full web page content:\n\n${allChunksText}`;
      messagesToSendToAPI.push({ role: "system", content: urlContextInfo });
    }

    // TODO: Add other contexts like documentFile, uploadedImageBase64 if they should persist for redo

    setMessages(historyForRedo); // Update UI to remove the old assistant response and subsequent messages
    setIsLoading(true);

    // --- Potential Re-Search Logic for Regeneration ---
    let lastUserQuery = "";
    const lastUserMessageIndex = historyForRedo.map(m => m.role).lastIndexOf('user');

    if (lastUserMessageIndex !== -1) {
      const lastUserMessage = historyForRedo[lastUserMessageIndex];
      if (typeof lastUserMessage.content === 'string') {
        lastUserQuery = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        lastUserQuery = lastUserMessage.content.filter(part => part.type === 'text').map(part => part.text).join(' ').trim();
      }
    }

    if (searchEnabled && lastUserQuery) {
      let currentSearchSystemMessageForUI = `🧠 Re-analyzing your query with AI to improve search for: "${lastUserQuery}"...`;
      setMessages(prev => [...prev, { role: "system", content: currentSearchSystemMessageForUI }]);

      const contextForAISuggestion = historyForRedo.slice(0, lastUserMessageIndex);
      const aiSuggestedQuery = await getAISuggestedSearchQuery(lastUserQuery, contextForAISuggestion);
      let queryToSearch = lastUserQuery;

      if (aiSuggestedQuery && aiSuggestedQuery.toLowerCase().trim() !== lastUserQuery.toLowerCase().trim()) {
        queryToSearch = aiSuggestedQuery.trim();
        currentSearchSystemMessageForUI = `🔍 AI suggested re-search: "${queryToSearch}". Searching... (Original: "${lastUserQuery}")`;
      } else {
        currentSearchSystemMessageForUI = `✅ AI analysis complete. Re-searching for: "${lastUserQuery}"...`;
      }

      setMessages(prev => { // Update the "Re-analyzing..." message in UI
        const newMsgs = [...prev];
        const lastMsgIdx = newMsgs.length - 1;
        if (lastMsgIdx >= 0 && newMsgs[lastMsgIdx].role === 'system' && newMsgs[lastMsgIdx].content.startsWith("🧠 Re-analyzing")) {
          newMsgs[lastMsgIdx].content = currentSearchSystemMessageForUI;
          return newMsgs;
        }
        return [...prev, { role: "system", content: currentSearchSystemMessageForUI }]; // Fallback
      });

      const searchResultsData = await searchWeb(queryToSearch);

      if (searchResultsData && searchResultsData.results && searchResultsData.results.length > 0) {
        const searchResultsTextForAI = searchResultsData.results.map((result, index) =>
          `[${index + 1}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}${result.fullContent ? '\nContent: ' + result.fullContent : ''}`
        ).join('\n\n');

        const queryInfoMessageForUI = `✅ Found ${searchResultsData.results.length} results for "${searchResultsData.queryUsed}" (re-search).`;
        setMessages(prev => [...prev, { role: "system", content: queryInfoMessageForUI }]);

        const contextualInfoForAI = (aiSuggestedQuery && aiSuggestedQuery.toLowerCase().trim() !== lastUserQuery.toLowerCase().trim()) ?
          `User's original query (for re-search): "${lastUserQuery}"\nAI suggested refined query (for re-search): "${queryToSearch}"\nFresh Search Results (re-search):\n${searchResultsTextForAI}` :
          `Fresh Search Results for "${queryToSearch}" (re-search):\n${searchResultsTextForAI}`;

        messagesToSendToAPI.push({ role: "system", content: `System Note: The following are fresh search results based on the user's prior query.\n${contextualInfoForAI}` });
      } else {
        const queryUsedForNoResults = searchResultsData && searchResultsData.queryUsed ? searchResultsData.queryUsed : queryToSearch;
        const noResultsMessageForUI = `ℹ️ No new results found for "${queryUsedForNoResults}" (re-search).`;
        setMessages(prev => [...prev, { role: "system", content: noResultsMessageForUI }]);
        messagesToSendToAPI.push({ role: "system", content: `System Note: A re-search was performed for "${queryUsedForNoResults}", but no new results were found.` });
      }
    }
    // --- End of Re-Search Logic ---

    // Use the potentially augmented messagesToSendToAPI for the API call.
    const streamResult = await fetchStreamingResponse(messagesToSendToAPI);
    if (streamResult.stream) {
      await processStream(streamResult.stream, historyForRedo); // Pass historyForRedo as the base for processStream
    } else {
      setMessages(prev => [...prev, { role: "system", content: `Streaming failed: ${streamResult.error || 'Unknown error'}. Attempting regular response...` }]);
      const regularResult = await fetchRegularResponse(messagesToSendToAPI);
      if (regularResult.error) {
        setMessages([...messagesToSendToAPI, { role: "system", content: `Error regenerating: ${regularResult.error}` }]); // Show error with full context that was sent
        // Or revert to just historyForRedo for UI if preferred: setMessages([...historyForRedo, { role: "system", content: `Error regenerating: ${regularResult.error}` }]);
      } else if (regularResult.content) {
        setMessages([...historyForRedo, { role: "assistant", content: regularResult.content }]); // UI shows original history + new assistant message
      }
      setIsLoading(false);
    }
  };

  const handleEditMessage = async (messageToEdit, newContentString) => {
    // Get original text content for comparison
    const originalTextContent = Array.isArray(messageToEdit.content)
      ? messageToEdit.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
      : (typeof messageToEdit.content === 'string' ? messageToEdit.content : "");

    if (newContentString.trim() === originalTextContent.trim()) return; // No actual change

    // Find the message index by matching role and either content or content array pattern
    const messageIndex = messages.findIndex(msg => {
      if (msg.role !== messageToEdit.role) return false;

      // Handle both string and array content formats
      if (Array.isArray(msg.content) && Array.isArray(messageToEdit.content)) {
        // For complex content arrays, check if this is the same message object
        return msg === messageToEdit;
      } else if (typeof msg.content === 'string' && typeof messageToEdit.content === 'string') {
        return msg.content === messageToEdit.content;
      }
      return false;
    });

    if (messageIndex === -1 || messageToEdit.role !== 'user') return;

    setIsLoading(true);

    // Create a copy of messages array
    const updatedMessages = [...messages];

    // --- Prepare Updated User Message for UI and API ---
    let updatedUiUserMessage;
    let updatedApiUserMessageContent; // This will be the content for the API call

    if (Array.isArray(messageToEdit.content)) { // Editing a multi-part message (e.g., text + image)
      const imageItems = messageToEdit.content.filter(item => item.type === 'image_url');
      // For UI, keep existing image URL (could be blob or original if re-editing)
      updatedUiUserMessage = {
        ...messageToEdit,
        content: [{ type: 'text', text: newContentString }, ...imageItems],
        selectedText: messageToEdit.selectedText // Preserve selected text
      };
      // For API, ensure base64 if image was originally uploaded
      const apiImageItems = imageItems.map(img => {
        // If this messageToEdit had a base64 version stored, use it.
        return img;
      });
      updatedApiUserMessageContent = [{ type: 'text', text: newContentString }, ...apiImageItems];

      // Update in the updatedMessages array
      updatedMessages[messageIndex] = updatedUiUserMessage;
    } else { // Editing a simple text message
      updatedUiUserMessage = { 
        ...messageToEdit, 
        content: newContentString,
        selectedText: messageToEdit.selectedText // Preserve selected text
      };
      updatedApiUserMessageContent = newContentString;

      // Update in the updatedMessages array
      updatedMessages[messageIndex] = updatedUiUserMessage;
    }

    // Keep all messages up to and including the edited message
    const messagesToKeep = updatedMessages.slice(0, messageIndex + 1);

    // Set the current messages to only include up to the edited message
    setMessages(messagesToKeep);

    // --- Build messages for API ---
    let messagesToSendToAPI = [...messagesToKeep].filter(msg => // Filter system messages as in handleSend
      !(msg.role === "system" && msg.content.startsWith("Welcome to the Chat Box!")) // etc.
    );

    // Check if search is enabled, if so, perform a search before getting AI response
    if (searchEnabled && typeof newContentString === 'string' && newContentString) {
      try {
        // Show system message indicating search is being performed
        setMessages(prev => [
          ...prev,
          { role: "system", content: `🔍 Searching the web for information about: "${newContentString}"...` }
        ]);

        // Add Document/URL Context if available (similar to handleSend)
        if (documentFile && documentContent?.chunks && documentContent.chunks[0]) {
          const chunk = documentContent.chunks[0];
          messagesToSendToAPI.push({ role: "system", content: `System Note: Document "${documentFile.name}" is active. Content:\n${chunk.text}` });
        } else if (documentFile && documentContent?.text) { // Fallback for documents that might not be chunked but have .text
          messagesToSendToAPI.push({ role: "system", content: `System Note: Document "${documentFile.name}" is active. Content:\n${documentContent.text}` });
        }
        if (scrapedUrlContent && scrapedUrlChunks.length > 0) {
          const allChunksText = scrapedUrlChunks.map(c => c.text).join("\n\n---\n\n");
          messagesToSendToAPI.push({ role: "system", content: `System Note: Scraped page "${scrapedUrlContent.title}" is active. Full Content:\n${allChunksText}` });
        }

        // Generate a context-aware search query
        const aiSuggestedQuery = await getAISuggestedSearchQuery(newContentString, messagesToKeep.slice(0, messageIndex));
        let queryToSearch = newContentString;

        if (aiSuggestedQuery && aiSuggestedQuery.toLowerCase() !== newContentString.toLowerCase()) {
          queryToSearch = aiSuggestedQuery;
          // Update UI system message
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsgIdx = newMsgs.length - 1;
            if (lastMsgIdx >= 0 && newMsgs[lastMsgIdx].role === 'system' && newMsgs[lastMsgIdx].content.startsWith("🔍 Searching")) {
              newMsgs[lastMsgIdx].content = `🧠 Understanding context: Searching for "${queryToSearch}"`;
              return newMsgs;
            }
            return [...prev, { role: "system", content: `🧠 Understanding context: Searching for "${queryToSearch}"` }];
          });
        }

        // Perform web search with the enhanced query
        const searchResultsData = await searchWeb(queryToSearch);

        if (searchResultsData.results && searchResultsData.results.length > 0) {
          // Format search results for API
          const searchResultsText = searchResultsData.results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n${r?.fullContent ? `Content: ${r.fullContent}` : ''}`).join('\n\n');

          // Add search results as system message for user to see
          const wasQueryEnhanced = queryToSearch !== newContentString;
          const queryInfoMessage = wasQueryEnhanced ?
            `✅ Found ${searchResultsData.results.length} results for "${queryToSearch}"` :
            `✅ Found ${searchResultsData.results.length} results for your edited message`;

          setMessages(prev => [
            ...prev,
            { role: "system", content: queryInfoMessage }
          ]);

          // Add search context as a system message for the AI
          const contextualInfo = wasQueryEnhanced ?
            `Note: The original user query "${newContentString}" was expanded to "${queryToSearch}" based on conversation context.` :
            '';

          messagesToSendToAPI.push({
            role: "system",
            content: `You are provided with the following search results for the user's edited query. Use this information to provide a more accurate and up-to-date response.\n${contextualInfo}\n\n${searchResultsText}`
          });

          // Also add a summary of recent conversation to help with context
          const recentMessages = messagesToKeep.slice(-6); // Last 6 messages for context
          if (recentMessages.length > 1) {
            const conversationContext = recentMessages.map(msg => {
              // Format based on role
              if (msg.role === 'user') {
                return `User: ${typeof msg.content === 'string' ? msg.content : 'Non-text message'}`;
              } else if (msg.role === 'assistant') {
                // Truncate assistant responses to keep context manageable
                const content = typeof msg.content === 'string' ? msg.content : 'Non-text message';
                const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
                return `Assistant: ${truncated}`;
              }
              return null;
            }).filter(Boolean).join('\n');

            // Add the conversation context to the messages for the API
            messagesToSendToAPI.push({
              role: "system",
              content: `Recent conversation context (for reference):\n${conversationContext}`
            });
          }
        } else {
          // If no results or error, just send original message
          setMessages(prev => [
            ...prev,
            { role: "system", content: `⚠️ No search results found. Proceeding with regular AI response.` }
          ]);
        }
      } catch (error) {
        console.error('Error in search for edited message:', error);

        // If there's an error in the search process, fallback to regular messaging
        setMessages(prev => [
          ...prev,
          { role: "system", content: `❌ Error searching the web: ${error.message}. Proceeding with regular AI response.` }
        ]);
      } finally {
        // Always add the edited user message to the API messages array
        messagesToSendToAPI.push({ role: "user", content: updatedApiUserMessageContent });
      }
    } else {
      // Default: Add the edited user's message if not searching
      messagesToSendToAPI.push({ role: "user", content: updatedApiUserMessageContent });
    }

    // --- Fetch AI Response for the edited query ---
    try {
      // First try streaming with the modified messages that may include search results
      const streamResult = await fetchStreamingResponse(messagesToSendToAPI);

      if (streamResult.stream) {
        // Process the stream if available
        await processStream(streamResult.stream, messagesToKeep);
      } else if (streamResult.error) {
        // If streaming fails with an error, try regular response
        console.log("Streaming failed, falling back to regular response");
        setMessages(prev => [...prev, { role: "system", content: `Streaming failed: ${streamResult.error || 'Unknown error'}. Attempting regular response...` }]);

        const regularResult = await fetchRegularResponse(messagesToSendToAPI);

        if (regularResult.error) {
          setMessages([
            ...messagesToKeep,
            { role: "system", content: `Error after edit: ${regularResult.error}` }
          ]);
        } else if (regularResult.content) {
          setMessages([
            ...messagesToKeep,
            { role: "assistant", content: regularResult.content }
          ]);
        }
      }
    } catch (error) {
      console.error("Error in handleEditMessage:", error);
      setMessages([
        ...messagesToKeep,
        { role: "system", content: `An error occurred: ${error.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Migrate old message format if needed
    const migrateAndSetMessages = async () => {
      if (!conversation?.id || (conversation.messages && conversation.messages.length === 0)) {
        setMessages([{ role: "system", content: WELCOME_MESSAGE }]);
        return;
      }

      let messagesModified = false;
      const newMessages = JSON.parse(JSON.stringify(conversation.messages)); // Deep copy

      for (const message of newMessages) {
        if (message.role === 'user' && Array.isArray(message.content)) {
          for (let i = 0; i < message.content.length; i++) {
            const part = message.content[i];
            if (part.type === 'image_url' && part.image_url.url.startsWith('data:image')) {
              const blob = dataURIToBlob(part.image_url.url);
              if (blob) {
                const imageId = `img-${Date.now()}-${Math.random()}`;
                await saveImage(imageId, blob);
                message.content[i] = { type: 'image_ref', imageId };
                messagesModified = true;
              }
            }
          }
        }
      }

      setMessages(newMessages);
      if (messagesModified) {
        onUpdateConversation({ ...conversation, messages: newMessages });
      }
    };

    if (conversation?.id) {
      migrateAndSetMessages();
      // Reset states
      setInput("");
      setIsLoading(false);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setUploadedFile(null);
      setUploadedImageUrl(null);
      setUploadedImageBase64(null);
      setDocumentFile(null);
      setDocumentContent(null);
      setScrapedUrlContent(null);
      setYoutubeInfo(null);
    }
  }, [conversation?.id, onUpdateConversation]);

  useEffect(() => {
    const loadImageUrls = async () => {
      const urlsToSet = {};
      const imageIdsInMessages = new Set();

      messages.forEach(msg => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'image_ref' && part.imageId) {
              imageIdsInMessages.add(part.imageId);
              if (!imageUrls[part.imageId]) {
                urlsToSet[part.imageId] = true;
              }
            }
          });
        }
      });

      for (const imageId in urlsToSet) {
        const blob = await getImage(imageId);
        if (blob) {
          urlsToSet[imageId] = URL.createObjectURL(blob);
        } else {
          delete urlsToSet[imageId];
        }
      }

      if (Object.keys(urlsToSet).length > 0) {
        setImageUrls(prev => ({ ...prev, ...urlsToSet }));
      }

      Object.keys(imageUrls).forEach(imageId => {
        if (!imageIdsInMessages.has(imageId)) {
          URL.revokeObjectURL(imageUrls[imageId]);
          setImageUrls(prev => {
            const next = { ...prev };
            delete next[imageId];
            return next;
          });
        }
      });
    };

    loadImageUrls();

    return () => {
      // This cleanup is tricky. A simple approach is to revoke all on unmount,
      // but that might not be sufficient if messages change frequently.
      // The current logic handles revocation when messages change.
    };
  }, [messages]);

  return (
    <div className="flex flex-col h-full relative z-10 bg-background">
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-4 relative bg-background z-10 min-h-[200px]"
      >
        {!firstMessageSent && messages.length === 1 && messages[0].role === 'system' && messages[0].content === WELCOME_MESSAGE && (
          <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
            <div className="text-center text-muted-foreground">
              <h1 className="text-2xl font-bold">Welcome to the Chat Box!</h1>
              <h3 className="text-lg font-semibold">How can I help you today?</h3>
            </div>
          </div>
        )}
        {/* Show document context if active */}
        {documentFile && documentContent && (
          <DocumentContext
            documentName={documentFile.name}
            documentContent={documentContent}
            totalChunks={documentContent.chunks?.length || 1}

            onClearDocument={() => {
              setDocumentFile(null); setDocumentContent(null);
              setMessages(prev => [...prev.filter(msg => !(msg.role === 'system' && msg.content.startsWith('Document loaded:'))), { role: "system", content: "Document context cleared." }]);
            }}
          />
        )}

        {/* Show YouTube context if active */}
        {youtubeInfo && (
          <YouTubeContext
            videoInfo={youtubeInfo}
            onClear={clearYoutubeContext}
          />
        )}

        {/* Display loading indicator for document processing */}
        {isProcessingDocument && (
          <div className="flex justify-center my-2">
            <div className="flex items-center space-x-2 text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
              <Loader2 className="h-3 w-3 animate-spin" /><span>Processing document...</span>
            </div>
          </div>
        )}

        {/* Messages Display */}
        {Array.isArray(messages) && messages.length > 0 ? (
          messages.map((message, index) => {
            if (!message || !message.role) {
              // console.error("Invalid message format at index", index, message);
              return null; // Skip rendering invalid messages
            }

            // Generate a more robust unique key
            let contentPreview = '';
            if (typeof message.content === 'string') {
              contentPreview = message.content.substring(0, 20);
            } else if (Array.isArray(message.content)) {
              const textPart = message.content.find(p => p.type === 'text');
              contentPreview = textPart ? textPart.text.substring(0, 20) : 'array_content';
            }
            const timestamp = message.timestamp || Date.now(); // Use a timestamp if available, else current time
            // const messageKey = `msg-${message.role}-${index}-${timestamp}-${contentPreview.replace(/\W/g, '')}`;
            const messageKey = `msg-${message.role}-${index}-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;


            if (message.role === "system") {
              return <SystemMessage key={messageKey}>{message.content}</SystemMessage>;
            }

            const lastUserMsgIndex = messages.reduceRight((acc, msg, i) => (acc === -1 && msg.role === "user" ? i : acc), -1);
            return (
              <Message
                key={messageKey}
                message={message}
                isUser={message.role === "user"}
                isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
                onRedoMessage={message.role === "assistant" && index === messages.length - 1 && !isLoading ? handleRedoMessage : undefined} // Only allow redo for last, non-streaming assistant message
                onEditMessage={message.role === "user" ? handleEditMessage : undefined}
                isLatestUserMessage={message.role === "user" && index === lastUserMsgIndex && !isLoading} // Only allow edit if not loading
                imageUrls={imageUrls}
              />
            );
          })
        ) : (
          !isLoading && <div className="p-4 text-center text-muted-foreground"><p>No messages yet. Start a conversation!</p></div>
        )}
        {/* General loading indicator if not specific to assistant streaming */}
        {isLoading && (!messages.length || messages[messages.length - 1]?.role !== 'assistant') && (
          <div className="flex justify-center my-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Summary Button */}
      {showQuickSummary && quickSummaryUrl && !youtubeInfo && (
        <div className="relative">
          <div className="absolute bottom-2 left-2 z-50">
            <div className="static flex items-center gap-1">
              <button
                onClick={handleQuickSummaryClick}
                className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs hover:bg-primary/20 transition-colors flex items-center gap-2 shadow-sm"
                title={`Summary ${quickSummaryUrl}`}
              >
                {isQuickSummaryLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileScan className="h-4 w-4" />
                )}
                <span className="truncate max-w-[180px]">Summary {quickSummaryUrl}</span>
              </button>
              <button
                onClick={dismissQuickSummary}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground border border-border flex items-center justify-center"
                title="Hide"
                aria-label="Hide quick summary"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <div className="relative">
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-50">
            <button
              onClick={() => {
                scrollToBottom();
                setShowScrollToBottom(false);
              }}
              className="border bg-[#212121] text-primary-foreground rounded-full w-8 h-8 shadow-lg hover:bg-[#212121]/90 transition-colors duration-200 flex items-center justify-center"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-background">
        {/* URL Detection Panel */}
        {detectedUrls.length > 0 && (
          <div className="mb-3 p-3 bg-[#303030]/90 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-sm font-medium text-primary">
                {detectedUrls.length === 1 ? 'URL detected:' : `${detectedUrls.length} URLs detected:`}
              </span>
            </div>
            <div className="space-y-1">
              {detectedUrls.map((url, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-[#303030] rounded border border-[#4a4a4a]">
                  <div className="flex-1 text-sm text-slate-100 font-mono break-all">
                    {url}
                  </div>
                  <Button
                    variant="ghost"
                    className="text-xs text-red-500 px-2 py-1 rounded-full hover:text-red-700 duration-200 transition-colors"
                    onClick={() => setDetectedUrls(prev => prev.filter((_, i) => i !== index))}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-primary">
              {detectedUrls.length === 1
                ? 'This URL will be scraped and analyzed with your message.'
                : 'These URLs will be scraped and analyzed with your message (max 3 URLs).'
              }
            </div>
          </div>
        )}

        {/* Toolbar: Model selector & Search Toggle */}
        <div className="flex items-center mb-2 text-xs text-muted-foreground">
          <div className="flex-1 flex gap-2 items-center">
            <Button
              variant={searchEnabled ? "secondary" : "ghost"}
              className="h-8 px-3 text-xs rounded-md flex items-center gap-2 hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
              title={searchEnabled ? "Web search before AI response is ON" : "Enable web search before AI response"}
              onClick={() => setSearchEnabled(prevState => !prevState)}
            >
              <Globe className="h-4 w-4" />
              {searchEnabled && <span className="text-xs px-1 py-0.5 rounded-sm">Search</span>}
            </Button>
          </div>
          {/* Model selector dropdown */}
          {availableModels && Object.keys(availableModels).length > 0 && (
            <div className="relative inline-block" ref={modelDropdownRef}>
              <Button variant="outline" className="h-8 px-3 text-xs rounded-md flex items-center gap-2 border-border bg-background hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)} title="Select AI model">
                <svg viewBox="0 0 24 24" height="16" width="16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                {model || "Default Model"}
              </Button>
              {isModelDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-64 bg-popover rounded-md shadow-lg z-50 overflow-hidden border border-border">
                  <div className="bg-muted px-3 py-2 border-b border-border space-y-2">
                    <h4 className="text-xs font-medium">Select AI Model</h4>
                    <div className="relative">
                      <input type="text" placeholder="Search models..." className="w-full text-xs py-1 px-2 rounded-md border border-input bg-background focus:border-primary focus:ring-1 focus:ring-primary" value={modelSearchQuery || ''} onChange={(e) => setModelSearchQuery(e.target.value)} onClick={(e) => e.stopPropagation()} />
                      {modelSearchQuery && (<button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={(e) => { e.stopPropagation(); setModelSearchQuery(''); }}><X className="h-3 w-3" /></button>)}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto no-scrollbar py-0 pretty-scrollbar">
                    {(() => {
                      const getModels = () => {
                        if (availableModels) {
                          if (typeof availableModels === 'object' && !Array.isArray(availableModels)) return availableModels;
                          if (Array.isArray(availableModels) && availableModels.length > 0) return { 'Available Models': availableModels }; // Group if it's a flat array
                        }
                        return {};
                      };
                      const modelsGroupedByProvider = getModels();
                      const providers = Object.keys(modelsGroupedByProvider);
                      const filteredProviders = providers.filter(provider => {
                        if (!modelSearchQuery) return true;
                        if (provider.toLowerCase().includes(modelSearchQuery.toLowerCase())) return true;
                        return modelsGroupedByProvider[provider].some(m => String(m).toLowerCase().includes(modelSearchQuery.toLowerCase()));
                      });
                      const filteredModelGroups = {};
                      filteredProviders.forEach(provider => {
                        filteredModelGroups[provider] = modelSearchQuery ? modelsGroupedByProvider[provider].filter(m => String(m).toLowerCase().includes(modelSearchQuery.toLowerCase())) : modelsGroupedByProvider[provider];
                      });
                      const finalFilteredProviders = filteredProviders.filter(provider => filteredModelGroups[provider].length > 0);

                      if (finalFilteredProviders.length > 0) {
                        return (<div className="py-0">{finalFilteredProviders.map(provider => (<div key={provider}><div className="px-3 py-1.5 text-xs font-semibold text-foreground/70 bg-muted/50 border-t border-b border-border first:border-t-0 sticky top-0 z-10">[{provider}]</div>{filteredModelGroups[provider].map((modelOption) => (<div key={`${provider}-${modelOption}`} className={`px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center ${model === modelOption ? 'bg-primary/10 font-medium text-primary' : ''}`} onClick={() => { onModelChange?.(modelOption); setIsModelDropdownOpen(false); setModelSearchQuery(''); }}><span className={`w-2 h-2 rounded-full mr-2 ${model === modelOption ? 'bg-primary' : 'bg-transparent border border-muted-foreground'}`}></span>{modelOption}</div>))}</div>))}</div>);
                      } else if (modelSearchQuery) {
                        return (<div className="px-3 py-4 text-xs text-muted-foreground text-center">No models matching "{modelSearchQuery}".</div>);
                      } else {
                        return (<div className="px-3 py-4 text-xs text-muted-foreground text-center">No models available.<p className="mt-1 text-xs">Please configure models in settings.</p></div>);
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Modern chat input area */}
        <div className="relative">
          <div id="chat-input" className="bg-card rounded-lg border border-input focus-within:ring-1 focus-within:ring-ring p-1 flex items-end">
            {/* File Upload Button & Dropdown */}
            <div className="relative self-end mb-1.5 ml-1" ref={fileDropdownRef}>
              <Button variant="ghost" size="icon" type="button" onClick={(e) => { e.stopPropagation(); setIsFileDropdownOpen(prev => !prev); }} className={`h-8 w-8 rounded-full ${isFileDropdownOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`} title="Add files">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Add Files</span>
              </Button>
              {isFileDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-popover rounded-md shadow-lg border border-border z-50" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center sticky top-0 z-10"><h4 className="text-xs font-medium">Upload Files</h4><Button variant="ghost" size="icon" className="h-5 w-5 p-0 hover:bg-destructive/20 rounded-full" onClick={() => setIsFileDropdownOpen(false)}><X className="h-3 w-3" /></Button></div>
                  <div className="p-2 space-y-1">
                    <div>
                      <input type="file" id="image-upload-input" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'image')} />
                      <Button variant="ghost" size="sm" className="w-full text-left flex items-center justify-start gap-2 hover:bg-accent h-8 text-popover-foreground" onClick={() => fileInputRef.current?.click()}><Image className="h-4 w-4 text-indigo-500" /><span className="text-xs">Upload Image</span></Button>
                    </div>
                    <div>
                      <input type="file" id="document-upload-input" accept=".pdf,.txt,.doc,.docx,.html,.css,.js,.md,.json" className="hidden" onChange={(e) => handleFileUpload(e, 'document')} />
                      <Button variant="ghost" size="sm" className="w-full text-left flex items-center justify-start gap-2 hover:bg-accent h-8 text-popover-foreground" onClick={() => document.getElementById('document-upload-input')?.click()} disabled={isProcessingDocument}>
                        {isProcessingDocument ? (<Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />) : (<FileText className="h-4 w-4 text-emerald-500" />)}
                        <span className="text-xs">{isProcessingDocument ? 'Processing...' : 'Upload Document'}</span></Button>
                    </div>
                    {fileUploadError && (<div className="px-2 py-1.5 text-[11px] text-destructive bg-destructive/10 rounded-sm border border-destructive/30 leading-tight">{fileUploadError}</div>)}
                  </div>
                </div>
              )}
            </div>

            {showPrompts && (
                <div className="absolute bottom-full mb-3 w-full bg-[#171717] border border-gray-700 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto transition-all duration-600 transform ease-in-out">
                  <ul className="p-2 animate-in fade-in duration-500 gap-y-2 overflow-hidden">
                    {filteredPrompts.map((p, index) => (
                      <li key={p.id} onClick={() => handlePromptSelect(p)} className={`p-2 hover:bg-[#262626] rounded-sm cursor-pointer ${index === selectedPromptIndex ? 'bg-[#262626]' : ''}`}>
                        <p className="font-semibold">{p.command}</p>
                        <p className="text-sm text-gray-400">{p.title.substring(0, 70)}...</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex-1 relative mx-1 overflow-hidden"> {/* Textarea and uploaded file preview */}
              {uploadedFile && (
                <div className="mx-1 px-2 py-1 bg-primary/10 rounded-md text-xs flex items-center gap-1 mb-1 border border-primary/20">
                  {uploadedFile.file.type.startsWith('image/') && uploadedImageUrl ? (
                    <img src={uploadedImageUrl} alt="preview" className="h-6 w-6 object-cover rounded-sm" />
                  ) : (
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <span className="truncate max-w-[150px] text-primary/80 text-[11px]" title={uploadedFile.file.name}>{uploadedFile.file.name}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 p-0 hover:bg-destructive/20 rounded-full ml-auto" onClick={() => { setUploadedFile(null); if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl); setUploadedImageUrl(null); setUploadedImageBase64(null); }}>
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              )}
              {
                selectedText && (
                  <div className="group relative mx-1 px-2 py-1 bg-primary/10 rounded-md text-xs flex overflow-hidden items-center gap-1 mb-1 border border-primary/20 animate-in fade-in duration-500">
                    <span className="truncate w-full text-primary/80 text-[11px] overflow-hidden" title={selectedText}>{selectedText.slice(0, 80)}...</span>
                    <Button variant="ghost" size="icon" className="absolute top-1/2 -translate-y-1/2 right-1 h-5 w-5 p-0 hover:bg-destructive/20 rounded-full ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setSelectedText(null); }}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                )
              }
            
              <textarea ref={textareaRef} placeholder="Message..." value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 py-2 px-2.5 min-h-[40px] max-h-[120px] resize-none overflow-y-auto no-scrollbar text-sm leading-relaxed" style={{ height: 'auto' }} rows={1} />
            </div>

            <div className="self-end mb-1.5 mr-1"> {/* Send Button */}
              {isStreaming ? (
                <Button
                  onClick={stopStreamingResponse}
                  size="icon"
                  className="h-8 w-8 rounded-full bg-primary hover:bg-primary/80 transition-colors text-white"
                  title="Stop AI response">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => handleSend()}
                  disabled={isLoading || (!input.trim() && !selectedText && !uploadedFile && !documentFile && !scrapedUrlContent && !youtubeInfo)}
                  size="icon"
                  className="h-8 w-8 rounded-full bg-primary hover:bg-primary/80 transition-colors text-primary-foreground"
                  title="Send message">
                  {isLoading ? (<Loader2 className="h-4 w-4 animate-spin" />) : (<Send className="h-4 w-4" />)}
                </Button>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1.5 text-right px-1">
            {showPrompts
              ? (input.trim() ? 'Enter to select' : (textareaRef.current && textareaRef.current.value.includes('\n') ? '' : 'Type / to show prompts'))
              : (input.trim() ? 'Enter to send' : (textareaRef.current && textareaRef.current.value.includes('\n') ? '' : 'Shift+Enter for new line'))
            }
          </div>
        </div>
      </div>
    </div>
  );
};
export default Chat;