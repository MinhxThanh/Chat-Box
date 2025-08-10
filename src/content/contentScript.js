// Constants from youtube-transcript
const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

// Error classes from youtube-transcript (modified for content script)
class YoutubeTranscriptError extends Error {
  constructor(message) {
    super(`[YoutubeTranscript] 🚨 ${message}`);
  }
}

class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
  constructor() {
    super(
      'YouTube is receiving too many requests from this IP and now requires solving a captcha to continue'
    );
  }
}

class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
  constructor(videoId) {
    super(`The video is no longer available (${videoId})`);
  }
}

class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
  constructor(videoId) {
    super(`Transcript is disabled on this video (${videoId})`);
  }
}

class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
  constructor(videoId) {
    super(`No transcripts are available for this video (${videoId})`);
  }
}

class YoutubeTranscriptNotAvailableLanguageError extends YoutubeTranscriptError {
  constructor(lang, availableLangs, videoId) {
    super(
      `No transcripts are available in ${lang} this video (${videoId}). Available languages: ${availableLangs.join(
        ', '
      )}`
    );
  }
}

// YoutubeTranscript class (modified for content script)
class YoutubeTranscript {
  static async fetchTranscript(
    videoId,
    config
  ) {
    const identifier = this.retrieveVideoId(videoId);
    const videoPageResponse = await fetch(
      `https://www.youtube.com/watch?v=${identifier}`, {
        headers: {
          ...(config?.lang && {
            'Accept-Language': config.lang
          }),
          'User-Agent': USER_AGENT,
        },
      }
    );
    const videoPageBody = await videoPageResponse.text();

    const splittedHTML = videoPageBody.split('"captions":');

    if (splittedHTML.length <= 1) {
      if (videoPageBody.includes('class="g-recaptcha"')) {
        throw new YoutubeTranscriptTooManyRequestError();
      }
      if (!videoPageBody.includes('"playabilityStatus":')) {
        throw new YoutubeTranscriptVideoUnavailableError(videoId);
      }
      throw new YoutubeTranscriptDisabledError(videoId);
    }

    const captions = (() => {
      try {
        return JSON.parse(
          splittedHTML[1].split(',"videoDetails')[0].replace('\n', '')
        );
      } catch (e) {
        return undefined;
      }
    })()?.['playerCaptionsTracklistRenderer'];

    if (!captions) {
      throw new YoutubeTranscriptDisabledError(videoId);
    }

    if (!('captionTracks' in captions)) {
      throw new YoutubeTranscriptNotAvailableError(videoId);
    }

    if (
      config?.lang &&
      !captions.captionTracks.some(
        (track) => track.languageCode === config.lang
      )
    ) {
      throw new YoutubeTranscriptNotAvailableLanguageError(
        config.lang,
        captions.captionTracks.map((track) => track.languageCode),
        videoId
      );
    }

    const trackToUse = config?.lang ?
      captions.captionTracks.find(
        (track) => track.languageCode === config.lang
      ) :
      captions.captionTracks.find(track => track.kind !== 'asr') || captions.captionTracks[0]; // Prefer non-ASR

    if (!trackToUse) {
      throw new YoutubeTranscriptNotAvailableError(videoId + (config?.lang ? ` for language ${config.lang}` : ''));
    }
    const transcriptURL = trackToUse.baseUrl;


    const transcriptResponse = await fetch(transcriptURL, {
      headers: {
        ...(config?.lang && {
          'Accept-Language': config.lang
        }),
        'User-Agent': USER_AGENT,
      },
    });
    if (!transcriptResponse.ok) {
      throw new YoutubeTranscriptNotAvailableError(videoId);
    }
    const transcriptBody = await transcriptResponse.text();
    const results = [...transcriptBody.matchAll(RE_XML_TRANSCRIPT)];
    return results.map((result) => ({
      text: result[3].replace(/&amp;#(\d+);/g, (match, dec) => String.fromCharCode(dec)).replace(/&amp;quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;amp;/g, '&'),
      duration: parseFloat(result[2]),
      offset: parseFloat(result[1]),
      lang: config?.lang || trackToUse.languageCode,
    }));
  }

  static retrieveVideoId(videoId) {
    if (videoId.length === 11) {
      return videoId;
    }
    const matchId = videoId.match(RE_YOUTUBE);
    if (matchId && matchId.length) {
      return matchId[1];
    }
    throw new YoutubeTranscriptError(
      'Impossible to retrieve Youtube video ID.'
    );
  }
}


// Function to create and display a video summary on the YouTube page
function createVideoSummary() {
  const videoSummary = document.createElement('div');
  videoSummary.id = 'chat-box-video-summary';
  videoSummary.className = 'chat-box-video-summary';

  Object.assign(videoSummary.style, {
    backgroundColor: '#282828',
    color: 'white',
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    width: 'calc(100% - 32px)',
    maxHeight: '500px',
    overflowY: 'auto',
    marginBottom: '20px',
    marginTop: '20px',
    fontSize: '14px',
    lineHeight: '1.5',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    position: 'relative',
    display: 'none', // Initially hidden
  });

  videoSummary.style.scrollbarWidth = 'thin';
  videoSummary.style.scrollbarColor = 'rgba(255,255,255,0.2) rgba(0,0,0,0)';

  // Create a container for the action buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'video-summary-actions';
  Object.assign(buttonContainer.style, {
    display: 'none', // Initially hidden
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '16px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255,255,255,0.1)'
  });

  // Create Copy button
  const copyButton = document.createElement('button');
  copyButton.innerHTML = `Copy <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" style="display: inline-block; vertical-align: middle; margin-left: 8px;">
    <path d="M9 15C9 12.1716 9 10.7574 9.87868 9.87868C10.7574 9 12.1716 9 15 9L16 9C18.8284 9 20.2426 9 21.1213 9.87868C22 10.7574 22 12.1716 22 15V16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H15C12.1716 22 10.7574 22 9.87868 21.1213C9 20.2426 9 18.8284 9 16L9 15Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M16.9999 9C16.9975 6.04291 16.9528 4.51121 16.092 3.46243C15.9258 3.25989 15.7401 3.07418 15.5376 2.90796C14.4312 2 12.7875 2 9.5 2C6.21252 2 4.56878 2 3.46243 2.90796C3.25989 3.07417 3.07418 3.25989 2.90796 3.46243C2 4.56878 2 6.21252 2 9.5C2 12.7875 2 14.4312 2.90796 15.5376C3.07417 15.7401 3.25989 15.9258 3.46243 16.092C4.51121 16.9528 6.04291 16.9975 9 16.9999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
  Object.assign(copyButton.style, {
    backgroundColor: 'hsl(249, 50%, 60%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease-in-out'
  });
  const originalCopyIcon = copyButton.innerHTML;
  const copiedIcon = `Copied <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-left: 8px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  copyButton.addEventListener('click', () => {
    const summaryContent = document.getElementById('chat-box-summary-content');
    if (summaryContent) {
      const textToCopy = summaryContent.innerText;
      
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          copyButton.innerHTML = copiedIcon;
          setTimeout(() => {
            copyButton.innerHTML = originalCopyIcon;
          }, 2000);
        })
        .catch(err => console.error('Failed to copy text: ', err));
    }
  });

  // Create Open Sidebar button
  const openSidebarButton = document.createElement('button');
  openSidebarButton.innerHTML = `Open Sidebar <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" style="display: inline-block; vertical-align: middle; margin-left: 8px;">
    <path opacity="0.4" d="M13 8.5H13.5V4.69635C13.5 4.31176 13.8118 4 14.1963 4C14.39 4 14.5749 4.08062 14.7066 4.22252L20.6598 10.6336C20.8785 10.8691 21 11.1786 21 11.5C21 11.8214 20.8785 12.1309 20.6598 12.3664L14.7066 18.7775C14.5749 18.9194 14.39 19 14.1963 19C13.8118 19 13.5 18.6882 13.5 18.3037V14.5C7.94555 14.5 4.94688 18.5162 4.19199 19.6847C4.06738 19.8776 3.85713 20 3.6275 20C3.28094 20 3 19.7191 3 19.3725V18.5C3 12.9772 7.47715 8.5 13 8.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M13.5 8.5V4.69635C13.5 4.31176 13.8118 4 14.1963 4C14.39 4 14.5749 4.08062 14.7066 4.22252L20.6598 10.6336C20.8785 10.8691 21 11.1786 21 11.5C21 11.8214 20.8785 12.1309 20.6598 12.3664L14.7066 18.7775C14.5749 18.9194 14.39 19 14.1963 19C13.8118 19 13.5 18.6882 13.5 18.3037V14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
  Object.assign(openSidebarButton.style, {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease-in-out'
  });
  openSidebarButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSidebar' });
  });

  buttonContainer.append(copyButton, openSidebarButton);

  // Add hover effects
  copyButton.addEventListener('mouseover', () => {
    copyButton.style.backgroundColor = 'hsl(249, 50%, 70%)';
    copyButton.style.transform = 'translateY(-2px)';
  });
  copyButton.addEventListener('mouseout', () => {
    copyButton.style.backgroundColor = 'hsl(249, 50%, 60%)';
    copyButton.style.transform = 'translateY(0)';
  });

  openSidebarButton.addEventListener('mouseover', () => {
    openSidebarButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    openSidebarButton.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    openSidebarButton.style.transform = 'translateY(-2px)';
  });
  openSidebarButton.addEventListener('mouseout', () => {
    openSidebarButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    openSidebarButton.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    openSidebarButton.style.transform = 'translateY(0)';
  });

  const summaryTitle = document.createElement('div');
  Object.assign(summaryTitle.style, {
    fontWeight: 'bold',
    fontSize: '16px',
    marginBottom: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    paddingBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  });

  const summaryTitleText = document.createElement('span');
  summaryTitleText.textContent = 'Video Summary (Loading...)';

  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  Object.assign(closeButton.style, {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 8px',
    marginLeft: 'auto'
  });
  closeButton.addEventListener('click', () => {
    videoSummary.style.display = 'none';
  });

  summaryTitle.appendChild(summaryTitleText);
  summaryTitle.appendChild(closeButton);

  const summaryContent = document.createElement('div');
  summaryContent.id = 'chat-box-summary-content';

  videoSummary.appendChild(summaryTitle);
  videoSummary.appendChild(summaryContent);
  videoSummary.appendChild(buttonContainer);

  return {
    container: videoSummary,
    title: summaryTitleText,
    content: summaryContent
  };
}

// Function to fetch a video summary from an AI model
async function fetchVideoSummary(videoInfo, summaryElements) {
  try {
    // Create a system prompt for the summary
    const systemPrompt = `You are a highly skilled AI assistant tasked with summarizing YouTube video content.

Here is the information about the video:
Transcript: "${videoInfo.transcript}"
Title: ${videoInfo.title}
Channel: ${videoInfo.channel || 'Unknown'}
${videoInfo.description ? `Description: ${videoInfo.description}\n` : ''}
Please use the provided transcript to generate the summary.

For each video, provide a structured summary with two sections: [Summary] and [Highlights].

[Summary]: Summarize the main content, theme, and purpose of the video in 2-3 concise sentences. Focus on the core message and intent without including unnecessary details.

[Highlights]: List 5-8 key points or notable moments from the video in bullet points. Each point should be brief, specific, and capture essential information, insights, or moments worth noting.

Use a clear, neutral, and professional tone. Ensure the output is engaging and easy to read, tailored to someone who wants a quick yet comprehensive overview of the video.`;

    // Try to get settings from localStorage first (if accessible)
    let localSettings = null;
    try {
      const localStorageSettings = localStorage.getItem('aiChatSettings');
      if (localStorageSettings) {
        localSettings = JSON.parse(localStorageSettings);
      }
    } catch (e) {
      reject('Could not access localStorage, will use chrome.storage.local ' + e)
    }

    // Get API key and endpoint from chrome storage
    return new Promise((resolve, reject) => {
      if (localSettings) {
        // We have local settings, use them directly
        processSettings(localSettings);
      } else {
        // Get from chrome.storage.local
        chrome.storage.local.get(['aiChatSettings'], async (result) => {

          if (!result || !result.aiChatSettings) {
            reject('API settings not configured. Please set up your API settings in the extension settings.');
            return;
          }

          processSettings(result.aiChatSettings);
        });
      }

      async function processSettings(settings) {

        // Get the selected model
        const selectedModel = settings.selectedModel || 'gpt-3.5-turbo';

        // Find the provider that owns the selected model
        let apiKey = '';
        let endpoint = '';
        let model = selectedModel;
        let providerWithModel = null;

        // Check if we have the new format with providers array
        if (settings.providers && Array.isArray(settings.providers)) {
          // First try to find the provider with the selected model
          providerWithModel = settings.providers.find(provider =>
            provider.models && Array.isArray(provider.models) &&
            provider.models.includes(selectedModel)
          );

          if (providerWithModel) {
            apiKey = providerWithModel.apiKey;
            endpoint = providerWithModel.endpoint;
          } else {
            // If no provider has the model, use the selected provider
            const selectedProvider = settings.providers.find(provider => provider.selectedProvider === true);
            if (selectedProvider) {
              apiKey = selectedProvider.apiKey;
              endpoint = selectedProvider.endpoint;
              // If the selected provider doesn't have the model in its list, we'll still use the model
              // but log a warning
              if (selectedProvider.models && !selectedProvider.models.includes(selectedModel)) {
                console.warn(`Warning: Model ${selectedModel} not found in provider ${selectedProvider.name}'s models list`);
              }
            }
          }
        } else {
          reject('Using legacy settings format (no providers array')
        }

        // Fallback to legacy format if needed
        if (!apiKey && settings.apiKey) {
          apiKey = settings.apiKey;
        }

        if (!endpoint && settings.endpoint) {
          endpoint = settings.endpoint;
        }

        // Default endpoint if still not set
        if (!endpoint) {
          endpoint = 'https://api.openai.com/v1';
        }

        if (!apiKey) {
          reject('API key not configured. Please set up your API key in the extension settings.');
          return;
        }

        try {
          // Build the chat completion URL
          const completionUrl = endpoint.endsWith('/') ?
            `${endpoint}chat/completions` :
            `${endpoint}/chat/completions`;

          // Create the request payload - now with streaming enabled
          const requestPayload = {
            model: model,
            messages: [{
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: `Summarize this YouTube video: ${videoInfo.title}`
              }
            ],
            max_tokens: 800,
            temperature: 0.7,
            stream: true // Enable streaming response
          };

          // Update UI to show we're starting to receive the stream
          if (summaryElements) {
            summaryElements.title.textContent = 'Video Summary (Streaming...)';
            summaryElements.content.innerHTML = renderMarkdown('Loading summary...');
          }

          // Make the API request
          const response = await fetch(completionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestPayload)
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || `Error ${response.status}: ${response.statusText}`;
            reject(errorMessage);
            return;
          }

          // Process the streaming response
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let fullContent = '';
          let buffer = '';

          // Start reading the stream
          while (true) {
            const {
              done,
              value
            } = await reader.read();
            if (done) break;

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, {
              stream: true
            });

            // Process the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

            for (const line of lines) {
              if (line.trim() === '') continue;
              if (line.trim() === 'data: [DONE]') continue;

              try {
                // Each line starts with 'data: ' followed by JSON
                if (line.startsWith('data: ')) {
                  const jsonData = JSON.parse(line.substring(6));
                  const content = jsonData.choices?.[0]?.delta?.content || '';

                  if (content) {
                    fullContent += content;

                    // Update the UI with the current content
                    if (summaryElements) {
                      summaryElements.content.innerHTML = renderMarkdown(fullContent);
                    }
                  }
                }
              } catch (e) {
                console.warn('Error parsing stream line:', e, line);
              }
            }
          }

          // Finish up the decoding
          const remaining = decoder.decode();
          if (remaining) buffer += remaining;

          if (buffer) {
            try {
              const lines = buffer.split('\n');
              for (const line of lines) {
                if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                  const jsonData = JSON.parse(line.substring(6));
                  const content = jsonData.choices?.[0]?.delta?.content || '';
                  if (content) fullContent += content;
                }
              }
            } catch (e) {
              console.warn('Error parsing final buffer:', e);
            }
          }

          // Final update of the content
          if (summaryElements) {
            summaryElements.title.textContent = 'Summary ' + videoInfo.title.substring(0, 30) + '...';
            summaryElements.content.innerHTML = renderMarkdown(fullContent);

            // Show the action buttons now that the content is fully loaded
            const buttonContainer = document.getElementById('video-summary-actions');
            if (buttonContainer) {
              buttonContainer.style.display = 'flex';
            }
          }

          resolve(fullContent || 'No summary generated');
        } catch (error) {
          console.error('Error in streaming request:', error);
          reject(`Error generating summary: ${error.message}`);
        }
      }
    });
  } catch (error) {
    console.error('Error in fetchVideoSummary:', error);
    return `Error generating summary: ${error.message}`;
  }
}

// Enhanced markdown renderer inspired by the Markdown.jsx component
function renderMarkdown(markdown) {
  if (!markdown) return '';

  // Add CSS styles for the markdown content - enhanced with styles from Markdown.jsx
  const markdownStyles = `
    .markdown-content { color: #e4e4e7; font-size: 15px; line-height: 1.6;}
    .markdown-content h1 { font-size: 1.5rem; font-weight: bold; margin: 1.2rem 0 0.8rem; color: white; }
    .markdown-content h2 { font-size: 1.25rem; font-weight: bold; margin: 1rem 0 0.7rem; color: white; }
    .markdown-content h3 { font-size: 1.1rem; font-weight: bold; margin: 0.8rem 0 0.5rem; color: white; }
    .markdown-content p { margin: 0.7rem 0; }
    .markdown-content ul { padding-left: 1.5rem; margin: 0.7rem 0; list-style-type: disc; }
    .markdown-content ol { padding-left: 1.5rem; margin: 0.7rem 0; list-style-type: decimal; }
    .markdown-content li { margin: 0.4rem 0; padding-left: 0.3rem; }
    .markdown-content li::marker { color: #737373; }
    .markdown-content code { background-color: rgba(255, 255, 255, 0.1); padding: 0.1rem 0.3rem; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.9em; }
    .markdown-content strong { font-weight: bold; color: white; }
    .markdown-content em { font-style: italic; }
    .markdown-content a { color: #3b82f6; text-decoration: underline; }
    .markdown-content a:hover { text-decoration: none; }
    .markdown-content blockquote { border-left: 3px solid #3b82f6; padding: 0.5rem 0 0.5rem 1rem; margin: 0.8rem 0; color: rgba(255, 255, 255, 0.7); background-color: rgba(59, 130, 246, 0.05); }
    .markdown-code-block { position: relative; margin: 1rem 0; overflow: hidden; }
    .markdown-code-content { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
    .copy-button { background: rgba(255, 255, 255, 0.1); border: none; border-radius: 4px; color: #e4e4e7; cursor: pointer; padding: 4px 8px; font-size: 12px; transition: background-color 0.2s; }
    .copy-button:hover { background: rgba(255, 255, 255, 0.2); }
    .copy-button.copied { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .markdown-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    .markdown-content th { background-color: rgba(255, 255, 255, 0.1); padding: 0.5rem; text-align: left; font-weight: bold; }
    .markdown-content td { padding: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); }
    .markdown-content tr:nth-child(even) { background-color: rgba(255, 255, 255, 0.05); }
    .markdown-hr { border: 0; height: 1px; background: rgba(255, 255, 255, 0.2); margin: 1.5rem 0; }
    .summary-highlight-heading {font-size: 2rem; font-weight: bold; color: hsl(249, 40%, 54%); margin: 2rem 0 1rem 0; }
    /* AI Thinking styles */
    .ai-thinking-container { margin: 1rem 0; border: 1px solid #3b4351; border-radius: 6px; overflow: hidden; }
    .ai-thinking-header { display: flex; align-items: center; justify-content: space-between; padding: 0.7rem 1rem; background-color: #353940; cursor: pointer; }
    .ai-thinking-title { display: flex; align-items: center; font-size: 0.8rem; font-weight: 600; color: #e4e4e7; }
    .ai-thinking-title svg { margin-right: 0.5rem; }
    .ai-thinking-content { padding: 1rem; font-size: 1.4rem; background-color: #1e1e1e; color: #a1a1aa; display: none; border-top: 1px solid #262626; }
    .ai-thinking-content.show { display: block; }
  `;

  // Insert styles into the page if they don't exist yet
  if (!document.getElementById('markdown-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'markdown-styles';
    styleEl.textContent = markdownStyles;
    document.head.appendChild(styleEl);
  }

  // Process thinking blocks first
  let hasThinkingContent = false;
  let thinkingContent = '';
  let mainContent = markdown;

  // Check for <think></think> tags
  const thinkingMatch = markdown.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkingMatch) {
    hasThinkingContent = true;
    thinkingContent = thinkingMatch[1].trim();
    // Remove the thinking block from the main content
    mainContent = markdown.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  // Process the markdown with regular expressions
  const processMarkdownContent = (content) => {
    return content
      // Code blocks without language
      .replace(/```([\s\S]*?)```/g, (match, code) => {
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="markdown-code-block">
        <div class="markdown-code-content"><div>${escapedCode}</div></div>
      </div>`;
      })
      // Tables
      .replace(/\|([^\n]*?)\|\n\|\s*:?-+:?\s*\|[^\n]*?\n([\s\S]*?)(?=\n\n|$)/g, (match, header, body) => {
        const headerCells = header.split('|').map(cell => cell.trim()).filter(Boolean);
        const headerRow = headerCells.map(cell => `<th>${cell}</th>`).join('');

        const rows = body.split('\n')
          .filter(row => row.trim() && row.includes('|'))
          .map(row => {
            const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
            return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
          }).join('');

        return `<table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
      })
      // Horizontal rule
      .replace(/^---+$/gm, '<hr class="markdown-hr">')
      // Headers
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // Blockquotes
      .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Lists - unordered
      .replace(/^\* (.*$)/gm, '<li>$1</li>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      // Lists - ordered
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Fix lists
      .replace(/<\/li><br><li>/g, '</li><li>')
      .replace(/<br><li>/g, '<ul><li>')
      .replace(/<\/li><br>/g, '</li></ul>')
      .replace(/<\/li>(?!<\/ul>)/g, '</li></ul>')
      .replace(/<ul><\/ul>/g, '');

    return content;
  };

  // Process main content and thinking content separately
  let mainHtml = processMarkdownContent(mainContent);
  let thinkingHtml = hasThinkingContent ? processMarkdownContent(thinkingContent) : '';

  // Apply the custom heading class to Summary and Highlights sections
  mainHtml = mainHtml.replace(/\[(Summary|Highlights)\]/g, '<strong class="summary-highlight-heading">[$1]</strong>');
  
  // Also apply the class to Summary/Highlights when they appear in h3 strong tags
  mainHtml = mainHtml.replace(/<h3>\s*<strong>(Summary|Highlights)<\/strong>\s*<\/h3>/g, '<h3><strong class="summary-highlight-heading">$1</strong></h3>');

  // Create the final HTML with thinking block if present
  let finalHtml = '';

  if (hasThinkingContent) {
    const uniqueId = `thinking-${Date.now()}`;
    finalHtml += `
      <div class="ai-thinking-container">
        <div class="ai-thinking-header" onclick="document.getElementById('${uniqueId}').classList.toggle('show')">
          <div class="ai-thinking-title" style="font-size: 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            AI Thinking Process
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div id="${uniqueId}" class="ai-thinking-content">
          ${thinkingHtml}
        </div>
      </div>
    `;
  }

  finalHtml += mainHtml;

  // Wrap with markdown-content class for styling
  return `<div class="markdown-content">${finalHtml}</div>`;
}

// Utility function to wait for an element to appear in the DOM
function waitForElement(selector) {
  return new Promise(resolve => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

// Create a button to open the sidebar and add it to the actions div
function createFloatingButton() {
  if (document.getElementById('ai-chat-sidebar-button')) {
    return; // Button already exists
  }
  // Look for the 'actions' div
  const actionsDiv = document.getElementById('actions');
  const topLevelButtonsComputedDiv = document.getElementById('top-level-buttons-computed');
  if (!actionsDiv && !topLevelButtonsComputedDiv) {
    return;
  }

  // Create the button
  const button = document.createElement('button');
  button.id = 'ai-chat-sidebar-button';
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0,0,256,256">
<g fill="#ffffff" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal"><g transform="scale(5.12,5.12)"><path d="M49.726,25.312l-18,-19c-0.003,-0.003 -0.007,-0.004 -0.01,-0.007c-0.074,-0.076 -0.165,-0.133 -0.26,-0.182c-0.022,-0.011 -0.038,-0.031 -0.061,-0.041c-0.074,-0.032 -0.158,-0.038 -0.24,-0.051c-0.05,-0.008 -0.095,-0.031 -0.146,-0.031c-0.001,0 -0.003,0.001 -0.005,0.001c-0.001,0 -0.003,-0.001 -0.004,-0.001h-11.852c-0.026,0 -0.048,0.013 -0.074,0.015c-0.025,-0.002 -0.048,-0.015 -0.074,-0.015c-0.002,0 -0.005,0 -0.007,0c-0.272,0.002 -0.532,0.114 -0.719,0.312l-17.98,18.98c-0.001,0.001 -0.001,0.001 -0.002,0.002l-0.017,0.018c-0.038,0.041 -0.056,0.091 -0.086,0.136c-0.039,0.058 -0.085,0.11 -0.112,0.176c-0.098,0.241 -0.098,0.51 0,0.751c0.027,0.066 0.073,0.118 0.112,0.176c0.03,0.045 0.048,0.095 0.086,0.136l0.017,0.018c0.001,0.001 0.001,0.001 0.002,0.002l17.98,18.979c0.188,0.2 0.451,0.354 0.726,0.312c0.026,0 0.049,-0.013 0.074,-0.015c0.026,0.004 0.048,0.017 0.074,0.017h11.632c0.039,0 0.072,-0.018 0.11,-0.022c0.038,0.004 0.072,0.022 0.11,0.022c0.002,0 0.005,0 0.007,0c0.272,-0.002 0.532,-0.114 0.719,-0.312l18,-19c0.366,-0.386 0.366,-0.99 0,-1.376zM46.675,25h-8.725l-11.575,-11.869l4.611,-4.69zM36.023,25.888c-0.003,0.029 -0.016,0.054 -0.017,0.083l-11.033,11.412l-11.172,-11.462l11.172,-11.364zM28.615,8l-3.636,3.698l-3.607,-3.698zM19.011,8.443l4.565,4.682l-11.674,11.875h-8.577zM19.008,43.554l-15.683,-16.554h8.675c0.018,0 0.032,-0.009 0.05,-0.01l11.532,11.832zM21.358,44l3.621,-3.745l3.65,3.745zM30.99,43.557l-4.621,-4.741l11.424,-11.816h8.882z"></path></g></g>
</svg> Summary`;

  // Style the button to match YouTube's UI
  Object.assign(button.style, {
    backgroundColor: '#373762',
    color: 'white',
    border: 'none',
    borderRadius: '20px',
    padding: '9px',
    margin: '0 4px',
    cursor: 'pointer',
    fontFamily: 'Roboto, Arial, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s, transform 0.2s',
    width: '120px',
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  });

  // Hover effect with subtle lift and smoother background color transitions
  button.addEventListener('mouseover', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.1)';
    button.style.backgroundColor = 'hsl(249, 50%, 70%)';
  });
  button.addEventListener('mouseout', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'none';
    button.style.backgroundColor = 'hsl(249, 50%, 60%)';
  });

  // Click handler to open sidebar and generate summary for YouTube videos
  button.addEventListener('click', async () => {
    const summaryContainer = document.getElementById('chat-box-video-summary');
    if (!summaryContainer) {
      console.error('AI Chat: Summary container not found.');
      return;
    }

    const isHidden = summaryContainer.style.display === 'none';
    summaryContainer.style.display = isHidden ? 'block' : 'none';

    if (isHidden && !summaryContainer.dataset.summaryFetched) {
      summaryContainer.dataset.summaryFetched = 'true';

      const youtubeInfo = await extractYouTubeInfo();
      if (youtubeInfo) {
        try {
          sessionStorage.setItem('youtubeVideoContext', JSON.stringify(youtubeInfo));
        } catch (e) {
          console.error('Failed to store YouTube context:', e);
        }

        const summaryTitle = summaryContainer.querySelector('span');
        const summaryContent = summaryContainer.querySelector('#chat-box-summary-content');

        if (summaryTitle && summaryContent) {
          summaryTitle.textContent = `Summarizing: ${youtubeInfo.title.substring(0, 50)}${youtubeInfo.title.length > 50 ? '...' : ''}`;
          summaryContent.textContent = 'Generating video summary...';

          fetchVideoSummary(youtubeInfo, { title: summaryTitle, content: summaryContent })
            .then(() => console.log('Summary generation completed successfully'))
            .catch(error => { summaryContent.textContent = `Error: ${error}`; });
        }
      }
    }
  });

  // Add the button to the actions div
  actionsDiv.appendChild(button);
}

// Global function to try multiple methods of opening sidebar
function tryOpenSidebar() {
  console.log('Global tryOpenSidebar called');
  const api = typeof browser !== 'undefined' ? browser : chrome;
  // First try: message background script
  api.runtime.sendMessage({
    action: 'openSidebar'
  }, (response) => {
    console.log('Background script response:', response);

    // If successful, we're done
    if (response && response.success) {
      console.log('Sidebar should be open via background script');
      return;
    }

    // Second try: direct sidepanel API
    console.log('First method failed, trying direct sidePanel API...');
    if (api.sidePanel && api.sidePanel.open) {
      api.sidePanel.open()
        .then(() => console.log('Sidebar opened via direct API'))
        .catch(err => {
          console.error('Failed with direct API:', err);

          // Third try: open extension in a new tab (last resort)
          console.log('Trying to open extension in new tab as last resort');
          const url = api.runtime.getURL('sidebar.html');
          if (api.tabs && api.tabs.create) {
            api.tabs.create({ url });
          } else {
            window.open(url, '_blank');
          }
        });
    } else if (api.sidebarAction && api.sidebarAction.open) {
      api.sidebarAction.open().catch(() => {
        const url = api.runtime.getURL('sidebar.html');
        if (api.tabs && api.tabs.create) {
          api.tabs.create({ url });
        } else {
          window.open(url, '_blank');
        }
      });
    } else {
      // Fallback if sidePanel API not available
      console.log('SidePanel API not available, opening extension page directly');
      const url = api.runtime.getURL('sidebar.html');
      if (api.tabs && api.tabs.create) {
        api.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    }
  });
}

// Function to extract page content and send it to the sidebar
function sendPageContentToSidebar() {
  try {
    // Extract the main content of the page
    const pageContent = extractPageContent();

    // Check if sidebar is open already
    chrome.runtime.sendMessage({
      action: 'checkSidebarStatus'
    }, (response) => {
      const sidebarWasOpen = response && response.isOpen;

      // Save the content to storage first so it won't be lost
      chrome.storage.local.set({
        webpageContent: {
          type: 'webpage',
          title: document.title,
          url: window.location.href,
          content: pageContent,
          timestamp: Date.now()
        }
      }, () => {

        // Now open the sidebar
        tryOpenSidebar();

        // If sidebar was already open, send the content immediately
        // Otherwise, wait longer for the sidebar to initialize fully
        const delay = sidebarWasOpen ? 500 : 2000;

        setTimeout(() => {
          console.log(`Sending page content to sidebar after ${delay}ms delay...`);
          // Send the content to the sidebar
          chrome.runtime.sendMessage({
            action: 'sendToChat',
            data: {
              type: 'webpage',
              title: document.title,
              url: window.location.href,
              content: pageContent
            }
          }, (response) => {
            console.log('Page content sent to sidebar:', response);
          });
        }, delay);
      });
    });
  } catch (error) {
    console.error('Error sending page content to sidebar:', error);
  }
}

// Function to extract meaningful content from the current page
function extractPageContent() {
  // Get the visible text content from the page
  // Focus on main content elements and exclude navigation, ads, etc.

  // Define elements that likely contain the main content
  const contentSelectors = [
    'article', 'main', '.content', '#content',
    '.post', '.article', '.entry-content',
    '[role="main"]', '.main-content'
  ];

  let mainContent = '';

  // Try to find main content containers first
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      // Combine text from all matching elements
      elements.forEach(el => {
        mainContent += el.innerText + '\n\n';
      });
      break; // Use the first successful selector
    }
  }

  // If no content found using selectors, extract from body with filtering
  if (!mainContent.trim()) {
    // Get all text nodes from the body
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          // Skip hidden elements and script/style content
          if (node.parentElement) {
            const style = window.getComputedStyle(node.parentElement);
            const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
            const isScript = node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE';

            if (isHidden || isScript) {
              return NodeFilter.FILTER_REJECT;
            }

            // Keep only nodes with meaningful content
            if (node.textContent.trim().length > 20) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node.textContent.trim());
    }

    // Join all meaningful text nodes
    mainContent = textNodes.join('\n\n');
  }

  // Clean up the content
  mainContent = mainContent
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/\n\s*\n/g, '\n\n') // Remove extra blank lines
    .trim();

  // Limit content length if it's too long (avoid sending too much data)
  const maxLength = 15000;
  if (mainContent.length > maxLength) {
    mainContent = mainContent.substring(0, maxLength) +
      '\n\n[Content truncated due to length. Extracted first ' + maxLength + ' characters]';
  }

  return mainContent || document.body.innerText.substring(0, maxLength);
}

// Function to extract YouTube video information
async function extractYouTubeInfo() { // Made async
  if (!isYouTubePage()) return null;

  try {
    // Basic video information
    const videoId = getYouTubeVideoId();
    const title = document.title.replace(' - YouTube', '');

    // Get video description
    let description = '';
    const descriptionElement = document.querySelector('#description-inline-expander, #description-text');
    if (descriptionElement) {
      description = descriptionElement.textContent.trim();
    }

    // Get channel name
    let channel = '';
    const channelElement = document.querySelector('#channel-name a, #text-container.ytd-channel-name a');
    if (channelElement) {
      channel = channelElement.textContent.trim();
    }

    // Get video stats (views, date)
    let videoStats = '';
    const statsElement = document.querySelector('#info-text');
    if (statsElement) {
      videoStats = statsElement.textContent.trim();
    }

    // Attempt to extract transcript
    let transcript = '';
    let transcriptSource = 'DOM'; // To log the source

    // List of selectors to try for transcript segments, ordered by likelihood/specificity
    const transcriptSelectors = [
      // Modern UI - transcript panel (most common)
      '#segments-container ytd-transcript-segment-renderer yt-formatted-string.segment-text',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] ytd-transcript-segment-renderer yt-formatted-string.segment-text',
      // Modern UI - older or alternative transcript renderer
      'ytd-transcript-renderer #content ytd-transcript-body-renderer yt-formatted-string.segment-text',
      // More generic selectors for modern UI segments if specific classes (.segment-text) are missing
      'ytd-transcript-segment-renderer yt-formatted-string',
      'ytd-transcript-segment-renderer .yt-core-attributed-string', // Alternative text container within a segment
      // Player-rendered captions (if transcript panel is not available/open)
      '.ytp-caption-segment',
      // ARIA-based transcript segments (for accessibility-focused structures)
      'div[aria-label^="Transcript segment"] .yt-core-attributed-string',
      'button[aria-label^="Transcript segment"] .yt-core-attributed-string', // If segments are interactive buttons
      // Older or less common structures
      '.ytd-transcript-body-renderer .cue', // Legacy cue elements
      '#transcript-text .cue', // Another possible legacy structure for cues
      'ytd-transcript-body-renderer div.cue-group div.cue', // Structure with cue groups and individual cues
      // A hypothetical common class name, as a last resort
      '.transcript-text-segment',
    ];

    let transcriptSegmentElements = null;
    for (const selector of transcriptSelectors) {
      transcriptSegmentElements = document.querySelectorAll(selector);
      if (transcriptSegmentElements && transcriptSegmentElements.length > 0) {
        break; // Found segments, stop searching
      }
    }

    if (transcriptSegmentElements && transcriptSegmentElements.length > 0) {
      const texts = [];
      transcriptSegmentElements.forEach(segmentEl => {
        let text = (segmentEl.textContent || segmentEl.innerText || '').trim();

        if (!text) {
          const parentDivSegment = segmentEl.closest('div.segment[role="button"]');
          if (parentDivSegment) {
            const ariaLabel = parentDivSegment.getAttribute('aria-label');
            if (ariaLabel) {
              let strippedText = '';
              const timePatternMatch = ariaLabel.match(/^(?:(?:\d{1,2}:)?\d{1,2}:)?\d{1,2}\s+(.*)$/);
              const secondsPatternMatch = ariaLabel.match(/^\d+\s+seconds?\s+(.*)$/i);

              if (timePatternMatch && timePatternMatch[1]) {
                strippedText = timePatternMatch[1].trim();
              } else if (secondsPatternMatch && secondsPatternMatch[1]) {
                strippedText = secondsPatternMatch[1].trim();
              }

              if (strippedText) {
                text = strippedText;
              }
            }
          }
        }

        if (text) {
          texts.push(text);
        }
      });
      transcript = texts.join(' ').replace(/\s+/g, ' ').trim();
    }

    // If DOM transcript is empty or too short, try network fetch
    if (!transcript || transcript.length < 50) {
      transcriptSource = 'Network';
      try {
        // Attempt to get user's language preference for transcript
        let preferredLang = document.documentElement.lang || navigator.language.split('-')[0] || 'en';
        let networkTranscriptResponses = [];

        try {
          networkTranscriptResponses = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: preferredLang
          });
        } catch (langError) {
          console.warn(`Failed to fetch transcript in preferred lang ${preferredLang}: ${langError.message}. Trying default.`);
          // If preferred language fails (e.g. not available), try fetching default (usually English or auto-generated)
          if (langError instanceof YoutubeTranscriptNotAvailableLanguageError || langError instanceof YoutubeTranscriptNotAvailableError) {
            networkTranscriptResponses = await YoutubeTranscript.fetchTranscript(videoId); // Fetch default
          } else {
            throw langError; // Re-throw other errors
          }
        }

        if (networkTranscriptResponses && networkTranscriptResponses.length > 0) {
          transcript = networkTranscriptResponses.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
        } 
      } catch (e) {
        console.error('Error fetching transcript via network:', e.message);
        // Log specific error types if needed
        if (e instanceof YoutubeTranscriptDisabledError) {
          console.warn("Network fetch: Transcript is disabled for this video.");
        } else if (e instanceof YoutubeTranscriptNotAvailableError) {
          console.warn("Network fetch: Transcript not available for this video.");
        }
        // The existing "Show transcript button" check can still be relevant here.
      }

      // If transcript is STILL empty or very short after network attempt, then log about manual button.
      if (!transcript || transcript.length < 50) {
        const showTranscriptButtonSelectors = [
          'ytd-menu-service-item-renderer button[aria-label="Show transcript"]',
          'button[aria-label*="Show transcript" i]',
          'button[title*="transcript" i]',
          '#description-box button[aria-label*="transcript" i]',
          'ytd-video-description-transcript-section-renderer button'
        ];
        let showTranscriptButtonFound = false;
        for (const btnSelector of showTranscriptButtonSelectors) {
          if (document.querySelector(btnSelector)) {
            showTranscriptButtonFound = true;
            break;
          }
        }
      }
    }

    return {
      type: 'youtube',
      videoId,
      title,
      description,
      channel,
      stats: videoStats,
      transcript,
      url: window.location.href
    };
  } catch (error) {
    console.error('Error extracting YouTube info:', error);
    return null;
  }
}

// Check if current page is a YouTube video page
function isYouTubePage() {
  return window.location.hostname.includes('youtube.com') &&
    window.location.pathname.includes('/watch') &&
    window.location.href.includes('v=');
}

// Extract YouTube video ID from URL
function getYouTubeVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

async function manageSummaryButton() {
  const button = document.getElementById('ai-chat-sidebar-button');
  const summaryBox = document.getElementById('chat-box-video-summary');

  if (isYouTubePage()) {
    if (!summaryBox) {
      const secondaryDiv = await waitForElement('#secondary-inner');
      if (secondaryDiv) {
        const summaryElements = createVideoSummary();
        if (secondaryDiv.firstChild) {
          secondaryDiv.insertBefore(summaryElements.container, secondaryDiv.firstChild);
        } else {
          secondaryDiv.appendChild(summaryElements.container);
        }
      }
    }
    if (!button) {
      createFloatingButton();
    }
  } else {
    if (button) {
      button.remove();
    }
    if (summaryBox) {
      summaryBox.remove();
    }
  }
}

// This observer ensures the button is added when the target elements (#actions) appear dynamically.
const observer = new MutationObserver(() => {
  manageSummaryButton();
});

// Main initialization logic
function init() {
  // We only care about youtube.
  if (!window.location.hostname.includes('youtube.com')) {
    return;
  }
  
  // Initial check
  manageSummaryButton();

  // Re-check on YouTube's specific navigation event
  window.addEventListener('yt-navigate-finish', manageSummaryButton);

  // Start observing for dynamic content changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

init();

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageContent") {
    // Check if this is a YouTube video page
    if (isYouTubePage()) {
      extractYouTubeInfo().then(youtubeInfo => { // extractYouTubeInfo is now async
        sendResponse({
          ...youtubeInfo,
          title: document.title,
          url: window.location.href,
        });
      }).catch(error => {
        console.error("Error in getPageContent for YouTube:", error);
        sendResponse({
          title: document.title,
          url: window.location.href,
          error: "Failed to extract YouTube info: " + error.message
        });
      });
    } else {
      // Regular page content with full text
      const pageContent = extractPageContent();
      sendResponse({
        title: document.title,
        url: window.location.href,
        content: pageContent
      });
    }
  }
  return true;
});