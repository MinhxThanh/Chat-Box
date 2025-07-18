import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Message, SystemMessage } from "./Message";
import { Send, Loader2, Plus, Image, FileText, X, Globe, Square } from "lucide-react";
import { extractTextFromDocument, DocumentContext } from "./DocumentProcessor";
import { YouTubeContext } from "./YouTubeContext";
import { WELCOME_MESSAGE } from "../utils/prompts";
import { getAllPrompts } from '../db/promptDb';
import { YoutubeTranscript } from 'youtube-transcript';
import { saveImage, getImage } from "../utils/db";

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
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  // YouTube content state
  const [youtubeInfo, setYoutubeInfo] = useState(null);
  const [blockYoutubeDetection, setBlockYoutubeDetection] = useState(false);
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
    }
  }, [conversation?.id]); // Rely only on conversation.id for resetting messages and context


  useEffect(() => {
    // Skip fetching if detection is blocked
    if (blockYoutubeDetection) {
      return;
    }

    // Only try to get YouTube content if we don't already have it
    // and not tied to conversation.id to avoid re-fetching on new chat if tab is same
    if (!youtubeInfo && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && tabs[0].id) { // Ensure tab and tab.id exist
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getPageContent" },
            function (response) {
              if (chrome.runtime.lastError) {
                // console.warn("Error sending message to content script (YouTube check):", chrome.runtime.lastError.message);
                return;
              }
              if (response && response.type === 'youtube') {
                console.log('Detected YouTube video, loading context:', response);
                setYoutubeInfo(response);
                setMessages(prev => {
                  // Avoid duplicate system messages about YouTube detection
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
  }, [youtubeInfo, blockYoutubeDetection]); // Depends on detection block flag

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      const validUrl = url.startsWith('http') ? url : `http://${url}`;

      // Import search utilities
      const { getSearchEngineConfig, scrapeWebpage } = await import('../utils/searchUtils');
      const searchConfig = await getSearchEngineConfig();

      // Check if a custom search engine is configured
      if (!searchConfig || (searchConfig.engine !== 'firecrawl' && searchConfig.engine !== 'jina') || !searchConfig.apiKey) {
        setIsScrapingUrl(false);
        setMessages(prev => [...prev, { role: "system", content: `⚠️ No custom search engine configured for web scraping. Please configure Firecrawl or Jina in the settings.` }]);
        return { success: false, error: 'No custom search engine configured for web scraping. Please configure Firecrawl or Jina in the settings.' };
      }

      // Update scraping message to show which engine is being used
      setMessages(prev => [
        ...prev.filter(m => !(m.role === 'system' && m.content.startsWith('Preparing to scrape'))),
        { role: "system", content: `Scraping web page using ${searchConfig.engine}: ${url}...` }
      ]);

      console.log(`Using ${searchConfig.engine} to scrape URL:`, validUrl);

      // Use the configured search engine to scrape the webpage
      const scrapedContent = await scrapeWebpage(validUrl, { formats: ["markdown", "text"] });

      // Handle different API response structures
      let content = '';
      let title = url;

      if (searchConfig.engine === 'firecrawl') {
        console.log('Firecrawl scrape response:', scrapedContent);
        // Firecrawl typically returns data with markdown field
        if (scrapedContent.data) {
          // Single URL scraping typically returns a single result object
          const data = scrapedContent.data;
          if (data.markdown) {
            content = data.markdown;
          } else if (data.text) {
            content = data.text;
          } else if (data.content) {
            content = data.content;
          }
          title = data.title || data.metadata?.title || url;
        } else {
          // Fallback to direct structure
          if (scrapedContent.markdown) {
            content = scrapedContent.markdown;
          } else if (scrapedContent.text) {
            content = scrapedContent.text;
          } else if (scrapedContent.content) {
            content = scrapedContent.content;
          }
          title = scrapedContent.title || scrapedContent.metadata?.title || url;
        }
      } else if (searchConfig.engine === 'jina') {
        console.log('Jina scrape response:', scrapedContent);
        // Jina response structure: { data: { title: "...", content: "..." } }
        if (scrapedContent.data && typeof scrapedContent.data === 'object' && !Array.isArray(scrapedContent.data)) {
          const dataObj = scrapedContent.data;
          if (dataObj.content) {
            content = dataObj.content;
          } else if (typeof dataObj.text === 'string') {
            content = dataObj.text;
          } else if (dataObj.markdown) {
            content = dataObj.markdown;
          }
          title = dataObj.title || url;
        } else if (scrapedContent.data && Array.isArray(scrapedContent.data) && scrapedContent.data.length > 0) {
          // Fallback: if .data IS an array (original expectation)
          console.warn('Jina response .data was an array. Using first element.');
          const firstItem = scrapedContent.data[0];
          if (firstItem.content) {
            content = firstItem.content;
          } else if (typeof firstItem.text === 'string') {
            content = firstItem.text;
          } else if (firstItem.markdown) {
            content = firstItem.markdown;
          }
          title = firstItem.title || url;
        } else {
          // Fallback for other unexpected structures or if .data is missing
          console.warn('Jina response .data is not the expected object or array structure, or is missing. Attempting direct parsing.');
          if (scrapedContent.content) { // Top-level content
            content = scrapedContent.content;
          } else if (typeof scrapedContent.text === 'string') {
            content = scrapedContent.text;
          } else if (scrapedContent.markdown) {
            content = scrapedContent.markdown;
          }
          // Ensure title is set if not already set by previous blocks
          if (!title) { // only set if not already set by previous blocks
            title = scrapedContent.title || url;
          }
        }
      }

      if (!content || content.trim() === '') {
        throw new Error(`${searchConfig.engine} returned empty content for ${validUrl}`);
      }

      // Process the content for the UI
      setScrapedUrlContent({ url: validUrl, title, content });
      const chunkSize = 3000; // Increased chunk size for better context
      const overlapSize = 300;
      const contentChunks = [];

      for (let i = 0; i < content.length; i += (chunkSize - overlapSize)) {
        contentChunks.push({
          index: contentChunks.length,
          text: content.substring(i, i + chunkSize)
        });
      }
      if (contentChunks.length === 0 && content.length > 0) { // Handle case where content is less than chunkSize
        contentChunks.push({ index: 0, text: content });
      }

      setScrapedUrlChunks(contentChunks);

      setMessages(prev => [
        ...prev.filter(m => !(m.role === 'system' && m.content.includes('scrape web page'))), // Remove scraping messages
        {
          role: "system",
          content: `Web page scraped with ${searchConfig.engine}: ${title} (${validUrl})\nContent split into ${contentChunks.length} chunks for analysis.`
        }
      ]);

      return { success: true, chunks: contentChunks, url: validUrl, title, engine: searchConfig.engine };

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


      const modelToUse = model || "Default"; // Default model
      const requestPayload = {
        ...(modelToUse && { model: modelToUse }),
        messages: filteredMessages,
        max_tokens: 2000, // Adjust as needed
        temperature: 0.5,
        stream: true
      };

      // console.log("API Request Payload (Streaming):", JSON.stringify(requestPayload, null, 2));
      const response = await fetch(completionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(requestPayload),
        signal // Add the abort signal to the fetch request
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
    if (abortControllerRef.current && isStreaming) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      console.log("Stream aborted by user");
    }
  };

  const processStream = async (stream, initialMessagesSnapshot) => {
    if (!stream) return;
    const reader = stream.getReader();
    let accumulatedContent = "";
    // Add a placeholder for the streaming AI response immediately
    // Use the snapshot of messages *before* this response started
    setMessages([...initialMessagesSnapshot, { role: "assistant", content: "" }]);

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
                    updatedMessages[updatedMessages.length - 1] = { role: "assistant", content: accumulatedContent };
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
            lastMsg.content += `\n[Error reading full stream: ${error.message}]`;
            return [...prev];
          }
          return [...prev, { role: "system", content: `Error processing stream: ${error.message}` }];
        });
      } else {
        // For abort errors, just update the UI to show streaming was stopped
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages.length > 0 && updatedMessages[updatedMessages.length - 1].role === 'assistant') {
            // Add a small note that the response was stopped
            updatedMessages[updatedMessages.length - 1].content += " [Response stopped by user]";
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
      // console.log("API Request Payload (Regular Fallback):", JSON.stringify({ model: modelToUse, messages: filteredMessages, max_tokens: 2000, temperature: 0.7 }, null, 2));
      const response = await fetch(completionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelToUse, messages: filteredMessages, max_tokens: 2000, temperature: 0.5 })
      });
      const data = await response.json().catch(() => ({ error: { message: response.statusText } }));
      if (!response.ok || data.error) {
        return { error: data.error?.message || `HTTP Error: ${response.status}` };
      } else {
        return { content: data.choices?.[0]?.message?.content || "No response received from API." };
      }
    } catch (error) {
      console.error("Error in fetchRegularResponse:", error);
      return { error: `API communication error (fallback): ${error.message}` };
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

  const handleSend = async () => {
    if (isLoading) return;
    // ... (rest of the code remains the same)
    const originalInputText = input.trim(); // Use this for logic, API, etc.
    
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
    
    const uiUserMessage = { role: "user", content: uiUserMessageContent };
    setMessages(prev => [...prev, uiUserMessage]); // Add user message to UI

    // Clear input and file states *after* preparing message content
    const inputForProcessing = originalInputText; // Save for processing, input state will be cleared
    setInput("");
    const wasFileUploaded = uploadedFile; // Check if a file was part of this send
    setUploadedFile(null); 
    // uploadedImageUrl is revoked by its own useEffect when it changes
    // setUploadedImageUrl(null); // Handled by useEffect cleanup
    setUploadedImageBase64(null);
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
    const urlCommandMatch = inputForProcessing.match(/^\[(summary|summarize|analyze|scrape)\s+(https?:\/\/[^\s]+|www\.[^\s]+)\]$/i);
    let urlToProcess = null;
    let isUrlCommand = false;
    let urlCommandAction = "analyze"; // Default action

    if (urlCommandMatch) {
        urlCommandAction = urlCommandMatch[1].toLowerCase();
        const potentialUrl = urlCommandMatch[2];
        if (isValidUrl(potentialUrl)) {
            urlToProcess = potentialUrl;
            isUrlCommand = true;
        }
    } else if (detectedUrlsInInput.length > 0 && isValidUrl(detectedUrlsInInput[0]) && !wasFileUploaded) { // Only auto-scrape if no file was uploaded with this message
        urlToProcess = detectedUrlsInInput[0];
    }
    
    if (urlToProcess) {
        // Add the user's original message that contained the URL/command to the API messages
        messagesToSendToAPI.push({ role: "user", content: inputForProcessing }); // The user's actual input

        const scrapeResult = await scrapeUrlContent(urlToProcess); // scrapeUrlContent now adds its own system messages for UI
        if (scrapeResult.success && scrapeResult.chunks && scrapeResult.chunks.length > 0) {
            const allChunksText = scrapeResult.chunks.map(c => c.text).join("\n\n---\n\n");
            const urlContextForAI = `System Note: The user has requested to process the URL: ${scrapeResult.title} (${scrapeResult.url}).
Action: ${isUrlCommand ? urlCommandAction : 'general query about URL'}.
Full web page content:\n${allChunksText}`;
            messagesToSendToAPI.push({ role: "system", content: urlContextForAI });
            // The user's *original message* (inputForProcessing) is already in messagesToSendToAPI.
            // The AI will see the URL context and then the user's message.
        }
        // Proceed to fetchStreamingResponse even if scraping failed, AI might comment on the error or original query
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
        await processStream(streamResult.stream, snapshotForStream);
    } else { 
        // Fallback to regular response if streaming failed or returned an error object
        setMessages(prev => [...prev, {role: "system", content: `Streaming failed: ${streamResult.error || 'Unknown error'}. Attempting regular response...`}]);
        const regularResult = await fetchRegularResponse(messagesToSendToAPI);
        if (regularResult.error) {
            setMessages(prev => [...prev, { role: "system", content: `Error: ${regularResult.error}` }]);
        } else if (regularResult.content) {
            setMessages(prev => [...prev, { role: "assistant", content: regularResult.content }]);
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
        content: [{ type: 'text', text: newContentString }, ...imageItems]
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
      updatedUiUserMessage = { ...messageToEdit, content: newContentString };
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
      <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-4 relative bg-background z-10 min-h-[200px]">
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

        {/* Show scraped URL context if active */}
        {scrapedUrlContent && scrapedUrlChunks.length > 0 && scrapedUrlChunks[0] && (
          <div className="bg-background p-3 border border-border mt-2 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium truncate" title={scrapedUrlContent.title}>Scraped: {scrapedUrlContent.title}</h4>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => removeScrapedContent(scrapedUrlContent.url)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <a href={scrapedUrlContent.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mb-2 block truncate" title={scrapedUrlContent.url}>{scrapedUrlContent.url}</a>

            <div className="text-sm max-h-32 overflow-y-auto p-2 border border-input rounded-md bg-muted/30 text-muted-foreground no-scrollbar">
              {scrapedUrlChunks.map(c => c.text).join("\n\n---\n\n")}
            </div>
          </div>
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

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-background">
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
                      <input type="file" id="document-upload-input" accept=".txt,.doc,.docx,.html,.css,.js,.md,.json" className="hidden" onChange={(e) => handleFileUpload(e, 'document')} />
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
                      <X classNam e="h-3 w-3 text-destructive" />
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
                  onClick={handleSend}
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