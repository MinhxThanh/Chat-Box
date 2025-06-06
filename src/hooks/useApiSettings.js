import { useState, useEffect } from 'react';

export const useApiSettings = () => {
  const [apiSettings, setApiSettings] = useState({
    apiKey: '',
    endpoint: '',
    model: 'gpt-3.5-turbo',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load settings from Chrome storage when component mounts
    chrome.storage.sync.get(['apiKey', 'endpoint', 'model'], (result) => {
      setApiSettings({
        apiKey: result.apiKey || '',
        endpoint: result.endpoint || '',
        model: result.model || 'gpt-3.5-turbo',
      });
      setIsLoading(false);
    });
  }, []);

  const saveApiSettings = (newSettings) => {
    return new Promise((resolve) => {
      chrome.storage.sync.set(newSettings, () => {
        setApiSettings((prev) => ({ ...prev, ...newSettings }));
        resolve();
      });
    });
  };

  return {
    apiSettings,
    isLoading,
    saveApiSettings,
  };
};
