import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export default function ApiKeyForm() {
  const [firecrawlKey, setFirecrawlKey] = useState('');
  const [jinaKey, setJinaKey] = useState('');
  const [selectedEngine, setSelectedEngine] = useState('default');
  const [error, setError] = useState('');

  // Load saved API keys from Chrome storage on component mount
  useEffect(() => {
    // Check if Chrome API is available (for browser extension)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['searchEngine'], (result) => {
        if (result.searchEngine) {
          setSelectedEngine(result.searchEngine.engine || 'default');
          if (result.searchEngine.engine === 'firecrawl') {
            setFirecrawlKey(result.searchEngine.apiKey || '');
          } else if (result.searchEngine.engine === 'jina') {
            setJinaKey(result.searchEngine.apiKey || '');
          }
        }
      });
    } else {
      // Fallback to localStorage for non-extension environments
      const savedEngine = localStorage.getItem('searchEngine');
      if (savedEngine) {
        const engineData = JSON.parse(savedEngine);
        setSelectedEngine(engineData.engine || 'default');
        if (engineData.engine === 'firecrawl') {
          setFirecrawlKey(engineData.apiKey || '');
        } else if (engineData.engine === 'jina') {
          setJinaKey(engineData.apiKey || '');
        }
      }
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // If no engine selected, treat as clearing API keys
    if (selectedEngine === 'default') {
      const payload = { engine: 'default', apiKey: '' };
      localStorage.removeItem('searchEngine');
      
      // Save to Chrome storage if available
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ searchEngine: payload }, () => {
          console.log('Search engine settings cleared');
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('searchEngine', JSON.stringify(payload));
      }
      
      return;
    }

    if (selectedEngine === 'firecrawl' && !firecrawlKey) {
      setError('Please enter your Firecrawl API Key.');
      return;
    }

    if (selectedEngine === 'jina' && !jinaKey) {
      setError('Please enter your Jina API Key.');
      return;
    }

    const payload = {
      engine: selectedEngine,
      apiKey: selectedEngine === 'firecrawl' ? firecrawlKey : jinaKey,
    };

    // Save to Chrome storage if available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ searchEngine: payload }, () => {
        console.log('Search engine settings saved:', payload.engine);
      });
    } else {
      // Fallback to localStorage
      localStorage.setItem('searchEngine', JSON.stringify(payload));
    }

    // Show success feedback
    setError('');
    alert(`${selectedEngine.charAt(0).toUpperCase() + selectedEngine.slice(1)} API key saved successfully!`);
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-100">Web Search Configuration</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <Label htmlFor="engineSelect" className="block text-sm font-medium mb-1">
            Select Search Engine
          </Label>
          <select
            id="engineSelect"
            value={selectedEngine}
            onChange={(e) => setSelectedEngine(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
          >
            <option value="default">Default</option>
            <option value="firecrawl">Firecrawl</option>
            <option value="jina">Jina</option>
          </select>
        </div>

        {selectedEngine === 'firecrawl' && (
          <div className="mb-4">
            <Label htmlFor="firecrawlKey" className="block text-sm font-medium">
              Firecrawl API Key
            </Label>
            <Input
              type="password"
              id="firecrawlKey"
              value={firecrawlKey}
              onChange={(e) => setFirecrawlKey(e.target.value)}
              placeholder="Enter Firecrawl API Key"
              className="mt-1 block w-full"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              API endpoint: https://api.firecrawl.dev/v1/search
            </p>
          </div>
        )}

        {selectedEngine === 'jina' && (
          <div className="mb-4">
            <Label htmlFor="jinaKey" className="block text-sm font-medium">
              Jina API Key
            </Label>
            <Input
              type="password"
              id="jinaKey"
              value={jinaKey}
              onChange={(e) => setJinaKey(e.target.value)}
              placeholder="Enter Jina API Key"
              className="mt-1 block w-full"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              API endpoint: https://s.jina.ai/
            </p>
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm mb-4">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full"
        >
          Save Search Engine Settings
        </Button>
      </form>
    </div>
  );
}
