/**
 * Utility functions for working with custom web search engines
 * - Search using Firecrawl or Jina
 * - Scrape webpage content using Firecrawl or Jina
 */

/**
 * Get the current search engine configuration from storage
 * @returns {Promise<Object>} Object containing engine type and API key
 */
export const getSearchEngineConfig = async () => {
  // Check if running in Chrome extension
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['searchEngine'], (result) => {
        resolve(result.searchEngine || { engine: 'default', apiKey: '' });
      });
    });
  } else {
    // Fallback to localStorage for development environment
    const savedEngine = localStorage.getItem('searchEngine');
    return savedEngine ? JSON.parse(savedEngine) : { engine: 'default', apiKey: '' };
  }
};

/**
 * Perform a search using the configured search engine
 * @param {string} query - The search query
 * @param {Object} options - Optional parameters for the search
 * @returns {Promise<Array>} Search results
 */
export const performSearch = async (query, options = {}) => {
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty');
  }

  const config = await getSearchEngineConfig();
  
  if (!config || config.engine === 'default' || !config.apiKey) {
    throw new Error('No search engine configured or missing API key');
  }

  let results;
  
  try {
    switch (config.engine) {
      case 'firecrawl':
        results = await searchWithFirecrawl(query, config.apiKey, options);
        break;
      case 'jina':
        results = await searchWithJina(query, config.apiKey, options);
        break;
      default:
        throw new Error(`Unsupported search engine: ${config.engine}`);
    }
    return results;
  } catch (error) {
    console.error(`Error performing search with ${config.engine}:`, error);
    throw error;
  }
};

/**
 * Scrape content from a webpage URL using the configured search engine
 * @param {string} url - The URL to scrape
 * @param {Object} options - Optional parameters for scraping
 * @returns {Promise<Object>} Scraped content
 */
export const scrapeWebpage = async (url, options = {}) => {
  if (!url || url.trim() === '') {
    throw new Error('URL cannot be empty');
  }

  // Validate URL format
  try {
    new URL(url); // This will throw if URL is invalid
  } catch (e) {
    throw new Error('Invalid URL format');
  }

  const config = await getSearchEngineConfig();
  
  if (!config || config.engine === 'none' || !config.apiKey) {
    throw new Error('No search engine configured or missing API key');
  }

  let results;
  
  try {
    switch (config.engine) {
      case 'firecrawl':
        results = await scrapeWithFirecrawl(url, config.apiKey, options);
        break;
      case 'jina':
        results = await scrapeWithJina(url, config.apiKey, options);
        break;
      default:
        throw new Error(`Unsupported search engine: ${config.engine}`);
    }
    return results;
  } catch (error) {
    console.error(`Error scraping webpage with ${config.engine}:`, error);
    throw error;
  }
};

/**
 * Search using Firecrawl API
 * @param {string} query - The search query
 * @param {string} apiKey - The Firecrawl API key
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array>} Search results
 */
async function searchWithFirecrawl(query, apiKey, options = {}) {
  const limit = options.limit || 3;
  const timeout = options.timeout || 20000;
  
  const response = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      limit,
      timeout,
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Search using Jina API
 * @param {string} query - The search query
 * @param {string} apiKey - The Jina API key
 * @param {Object} options - Optional parameters
 * @returns {Promise<Array>} Search results
 */
async function searchWithJina(query, apiKey, options = {}) {
  // Encode the query for URL
  const body = {
    q: encodeURIComponent(query),
    ...options
  };
  
  const response = await fetch('https://s.jina.ai/', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Engine': 'direct'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Scrape a webpage using Firecrawl API
 * @param {string} url - The URL to scrape
 * @param {string} apiKey - The Firecrawl API key
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeWithFirecrawl(url, apiKey, options = {}) {
  
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl scrape API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Scrape a webpage using Jina API
 * @param {string} url - The URL to scrape
 * @param {string} apiKey - The Jina API key
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeWithJina(url, apiKey, options = {}) {
  const response = await fetch('https://r.jina.ai/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      url
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jina scrape API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data;
}
