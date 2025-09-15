/**
 * URL Scraping Utility
 * Handles multi-URL scraping using Jina AI or Firecrawl
 * Supports both sequential and parallel processing
 */

import { getSearchEngineConfig } from './searchUtils.js';

/**
 * Scrape a single URL using the configured search engine
 * @param {string} url - The URL to scrape
 * @param {string} apiKey - The API key
 * @param {string} engine - The search engine ('jina' or 'firecrawl')
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} Scraped content result
 */
async function scrapeSingleUrl(url, apiKey, engine, options = {}) {
  const result = {
    url,
    success: false,
    content: null,
    title: url,
    error: null
  };

  try {
    let response;

    if (engine === 'jina') {
      // Jina AI scraping - convert timeout from ms to seconds (max 180 seconds)
      const jinaOptions = { ...options };
      if (jinaOptions.timeout) {
        jinaOptions.timeout = Math.min(Math.floor(jinaOptions.timeout / 1000), 180);
      }

      response = await fetch('https://r.jina.ai/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url,
          ...jinaOptions
        })
      });
    } else if (engine === 'firecrawl') {
      // Firecrawl scraping
      response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url,
          formats: options.formats || ["markdown"],
          onlyMainContent: options.onlyMainContent !== false,
          ...options
        })
      });
    } else {
      throw new Error(`Unsupported engine: ${engine}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${engine} API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Normalize response structures based on docs
    if (engine === 'jina') {
      // Jina Reader API returns top-level: { code, status, data: { title, content, ... } }
      const payload = data?.data || data;
      const content = payload?.content || payload?.markdown || payload?.text || '';
      const title = payload?.title || url;
      result.success = Boolean(content && content.trim().length > 0);
      result.content = typeof content === 'string' ? content : JSON.stringify(content);
      result.title = title;
    } else if (engine === 'firecrawl') {
      // Firecrawl returns { success, data: { markdown, html, metadata{title,...} } }
      const payload = data?.data || data;
      const content = payload?.markdown || payload?.html || payload?.text || '';
      const title = payload?.metadata?.title || payload?.title || url;
      result.success = Boolean(content && (typeof content === 'string' ? content.trim().length > 0 : true));
      result.content = typeof content === 'string' ? content : JSON.stringify(content);
      result.title = title;
    }

  } catch (error) {
    result.error = error.message;
    console.error(`Error scraping ${url} with ${engine}:`, error);
  }

  return result;
}

/**
 * URL Scraper class for managing multi-URL scraping operations
 */
export class UrlScraper {
  constructor(options = {}) {
    this.delay = options.delay || 0.5; // Delay between requests in seconds
    this.maxWorkers = options.maxWorkers || 3; // Max parallel workers
    this.timeout = options.timeout || 30000; // Request timeout in ms
    this.engine = options.engine || null; // 'jina' or 'firecrawl'
    this.apiKey = options.apiKey || null;
  }

  /**
   * Initialize scraper with search engine config
   * @returns {Promise<UrlScraper>} Configured scraper instance
   */
  static async create(options = {}) {
    const scraper = new UrlScraper(options);

    // Get search engine config if not provided
    if (!scraper.engine || !scraper.apiKey) {
      const config = await getSearchEngineConfig();
      if (config && config.engine !== 'default' && config.apiKey) {
        scraper.engine = config.engine;
        scraper.apiKey = config.apiKey;
      }
    }

    return scraper;
  }

  /**
   * Scrape a single URL
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} Scraping result
   */
  async scrapeUrl(url, options = {}) {
    if (!this.engine || !this.apiKey) {
      throw new Error('No search engine configured or missing API key');
    }

    // Validate URL
    try {
      new URL(url.startsWith('http') ? url : `http://${url}`);
    } catch (e) {
      return {
        url,
        success: false,
        content: null,
        title: url,
        error: 'Invalid URL format'
      };
    }

    const validUrl = url.startsWith('http') ? url : `http://${url}`;
    return await scrapeSingleUrl(validUrl, this.apiKey, this.engine, {
      timeout: this.timeout,
      ...options
    });
  }

  /**
   * Scrape multiple URLs sequentially
   * @param {string[]} urls - Array of URLs to scrape
   * @param {Object} options - Scraping options
   * @param {Function} onProgress - Progress callback function
   * @returns {Promise<Object[]>} Array of scraping results
   */
  async scrapeUrlsSequential(urls, options = {}, onProgress = null) {
    const results = [];
    const total = urls.length;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          url,
          status: 'scraping'
        });
      }

      const result = await this.scrapeUrl(url, options);
      results.push(result);

      // Rate limiting delay (except for last item)
      if (i < urls.length - 1 && this.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay * 1000));
      }
    }

    if (onProgress) {
      onProgress({
        current: total,
        total,
        status: 'completed'
      });
    }

    return results;
  }

  /**
   * Scrape multiple URLs in parallel
   * @param {string[]} urls - Array of URLs to scrape
   * @param {Object} options - Scraping options
   * @param {Function} onProgress - Progress callback function
   * @returns {Promise<Object[]>} Array of scraping results
   */
  async scrapeUrlsParallel(urls, options = {}, onProgress = null) {
    const results = [];
    const total = urls.length;

    // Process URLs in batches to respect maxWorkers limit
    for (let i = 0; i < urls.length; i += this.maxWorkers) {
      const batch = urls.slice(i, i + this.maxWorkers);
      const batchPromises = batch.map(url => this.scrapeUrl(url, options));

      if (onProgress) {
        batch.forEach((url, batchIndex) => {
          onProgress({
            current: i + batchIndex + 1,
            total,
            url,
            status: 'scraping'
          });
        });
      }

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay between batches (except for last batch)
      if (i + this.maxWorkers < urls.length && this.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay * 1000));
      }
    }

    if (onProgress) {
      onProgress({
        current: total,
        total,
        status: 'completed'
      });
    }

    return results;
  }

  /**
   * Scrape multiple URLs with automatic batch processing
   * Uses parallel processing for small batches, sequential for larger ones
   * @param {string[]} urls - Array of URLs to scrape
   * @param {Object} options - Scraping options
   * @param {Function} onProgress - Progress callback function
   * @returns {Promise<Object[]>} Array of scraping results
   */
  async scrapeUrls(urls, options = {}, onProgress = null) {
    if (!urls || urls.length === 0) {
      return [];
    }

    // For small number of URLs, use parallel processing
    if (urls.length <= this.maxWorkers) {
      return this.scrapeUrlsParallel(urls, options, onProgress);
    }

    // For larger batches, use sequential processing to avoid overwhelming the API
    return this.scrapeUrlsSequential(urls, options, onProgress);
  }

  /**
   * Process scraped results and create content chunks
   * @param {Object[]} results - Array of scraping results
   * @param {Object} options - Processing options
   * @returns {Object} Processed content with chunks
   */
  processScrapedResults(results, options = {}) {
    const maxChunkSize = options.maxChunkSize || 4000;
    const overlapSize = options.overlapSize || 200;

    const successfulResults = results.filter(r => r.success && r.content);
    const failedResults = results.filter(r => !r.success);

    let allContent = '';
    const chunks = [];

    // Combine all successful content
    successfulResults.forEach((result, index) => {
      const header = `=== ${result.title} (${result.url}) ===\n\n`;
      allContent += header + result.content + '\n\n---\n\n';
    });

    // Split into chunks if content is too large
    if (allContent.length > maxChunkSize) {
      let start = 0;
      while (start < allContent.length) {
        let end = start + maxChunkSize;

        // Try to find a good break point (end of sentence or paragraph)
        if (end < allContent.length) {
          const lastPeriod = allContent.lastIndexOf('.', end);
          const lastNewline = allContent.lastIndexOf('\n', end);

          if (lastPeriod > start && lastPeriod > lastNewline) {
            end = lastPeriod + 1;
          } else if (lastNewline > start) {
            end = lastNewline + 1;
          }
        }

        const chunk = allContent.slice(start, end).trim();
        if (chunk) {
          chunks.push({
            text: chunk,
            start: start,
            end: end,
            urls: successfulResults.map(r => ({ url: r.url, title: r.title }))
          });
        }

        // Move start position with overlap
        start = Math.max(start + 1, end - overlapSize);
      }
    } else {
      chunks.push({
        text: allContent.trim(),
        start: 0,
        end: allContent.length,
        urls: successfulResults.map(r => ({ url: r.url, title: r.title }))
      });
    }

    return {
      success: successfulResults.length > 0,
      totalUrls: results.length,
      successfulUrls: successfulResults.length,
      failedUrls: failedResults.length,
      content: allContent.trim(),
      chunks,
      results,
      errors: failedResults.map(r => ({ url: r.url, error: r.error }))
    };
  }
}

/**
 * Convenience function to scrape multiple URLs
 * @param {string[]} urls - Array of URLs to scrape
 * @param {Object} options - Scraping options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Scraping results with processed content
 */
export async function scrapeMultipleUrls(urls, options = {}, onProgress = null) {
  const scraper = await UrlScraper.create(options);
  const results = await scraper.scrapeUrls(urls, options, onProgress);
  return scraper.processScrapedResults(results, options);
}

/**
 * Convenience function to scrape a single URL
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} Scraping result
 */
export async function scrapeUrl(url, options = {}) {
  const scraper = await UrlScraper.create(options);
  return await scraper.scrapeUrl(url, options);
}
