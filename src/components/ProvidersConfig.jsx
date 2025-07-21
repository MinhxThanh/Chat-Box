import React, { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Save, Loader2, Minus, Download, Upload } from "lucide-react";

// Import provider icons
import OpenAIIcon from "../../assets/providers/OpenAI.svg";
import ClaudeIcon from "../../assets/providers/anthropic.svg";
import DeepSeekIcon from "../../assets/providers/DeepSeek.svg";
import GroqIcon from "../../assets/providers/Groq.svg";
import CustomIcon from "../../assets/providers/Custom.svg";
import LocalIcon from "../../assets/providers/local.svg";

// Utility function to safely convert any value to a string for rendering
const safeToString = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  // For objects, arrays, etc., convert to a JSON string for safety
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "[Object]";
  }
};

const ProvidersConfig = ({
  settings,
  onSettingsChange,
  onSaveSettings,
  showAlert,
}) => {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Export providers configuration
  const handleExportProviders = () => {
    try {
      const exportData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        providers: settings.providers || [],
        selectedModel: settings.selectedModel || null,
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri =
        "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

      const exportFileDefaultName = `providers-config-${
        new Date().toISOString().split("T")[0]
      }.json`;

      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();

      showAlert("Success", "Providers configuration exported successfully!");
    } catch (error) {
      console.error("Failed to export providers:", error);
      showAlert(
        "Error",
        "Failed to export providers configuration. Please try again."
      );
    }
  };

  // Import providers configuration
  const handleImportProviders = () => {
    fileInputRef.current?.click();
  };

  // Handle file change for import
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate import data structure
      if (!importData.providers || !Array.isArray(importData.providers)) {
        throw new Error("Invalid file format: missing providers array");
      }

      // Validate each provider has required fields
      const validProviders = importData.providers.filter((provider) => {
        return (
          provider &&
          typeof provider.provider === "string" &&
          typeof provider.name === "string" &&
          typeof provider.endpoint === "string"
        );
      });

      if (validProviders.length === 0) {
        throw new Error("No valid providers found in the file");
      }

      // Ask user if they want to merge or replace existing providers
      const existingProvidersCount = settings.providers?.length || 0;
      if (existingProvidersCount > 0) {
        showAlert(
          "Import Providers",
          `Found ${validProviders.length} valid provider(s) to import. This will replace your current ${existingProvidersCount} provider(s). Continue?`,
          () => {
            // Import the providers
            const updatedSettings = {
              ...settings,
              providers: validProviders,
              selectedModel: importData.selectedModel || null,
            };

            onSettingsChange(updatedSettings);
            showAlert(
              "Success",
              `Successfully imported ${validProviders.length} provider(s)!`
            );
          },
          true // showCancel
        );
      } else {
        // No existing providers, just import
        const updatedSettings = {
          ...settings,
          providers: validProviders,
          selectedModel: importData.selectedModel || null,
        };

        onSettingsChange(updatedSettings);
        showAlert(
          "Success",
          `Successfully imported ${validProviders.length} provider(s)!`
        );
      }
    } catch (error) {
      console.error("Failed to import providers:", error);
      showAlert(
        "Error",
        `Failed to import providers: ${error.message || "Invalid file format"}`
      );
    }

    // Reset file input
    event.target.value = "";
  };

  // Predefined providers
  const predefinedProviders = [
    {
      provider: "openai",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1",
      icon: OpenAIIcon,
    },
    {
      provider: "claude",
      name: "Claude",
      endpoint: "https://api.anthropic.com/v1",
      icon: ClaudeIcon,
    },
    {
      provider: "deepseek",
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/v1",
      icon: DeepSeekIcon,
    },
    {
      provider: "groq",
      name: "Groq",
      endpoint: "https://api.groq.com/openai/v1",
      icon: GroqIcon,
    },
    {
      provider: "local",
      name: "Local",
      endpoint: "",
      icon: LocalIcon,
    },
    {
      provider: "custom",
      name: "Custom",
      endpoint: "",
      icon: CustomIcon,
    },
  ];

  // Get the currently selected provider
  const getSelectedProvider = () => {
    if (!settings.providers || settings.providers.length === 0) return null;
    return (
      settings.providers.find((p) => p.selectedProvider) ||
      settings.providers[0]
    );
  };

  const selectedProvider = getSelectedProvider();

  // Handle provider selection
  const selectProvider = (providerType) => {
    // Make a deep copy of the current providers to prevent modifying the original array
    const newProviders = settings.providers
      ? JSON.parse(JSON.stringify(settings.providers))
      : [];

    // Check if this provider already exists
    const existingIndex = newProviders.findIndex(
      (p) => p.provider === providerType
    );

    // If it exists, just select it
    if (existingIndex >= 0) {
      // Mark only this provider as selected but preserve all providers' data
      newProviders.forEach((p, i) => {
        p.selectedProvider = i === existingIndex;
      });
    } else {
      // Create a new provider of this type
      const template = predefinedProviders.find(
        (p) => p.provider === providerType
      );
      const newProvider = {
        selectedProvider: true,
        provider: providerType,
        name: template.name,
        endpoint: template.endpoint,
        apiKey: "",
        models: [],
      };

      // Deselect all existing providers but keep their data
      newProviders.forEach((p) => (p.selectedProvider = false));
      newProviders.push(newProvider);
    }

    // Update settings with the new providers array
    onSettingsChange({
      ...settings,
      providers: newProviders,
    });
  };

  // Update current provider's API key
  const updateProviderApiKey = (apiKey) => {
    if (!selectedProvider) return;

    const newProviders = settings.providers.map((p) => {
      if (p.selectedProvider) {
        return { ...p, apiKey };
      }
      return p;
    });

    onSettingsChange({
      ...settings,
      providers: newProviders,
    });
  };

  // Update provider's endpoint (for custom and local)
  const updateProviderEndpoint = (endpoint) => {
    if (
      !selectedProvider ||
      (selectedProvider.provider !== "custom" &&
        selectedProvider.provider !== "local")
    )
      return;

    const newProviders = settings.providers.map((p) => {
      if (p.selectedProvider) {
        return { ...p, endpoint };
      }
      return p;
    });

    onSettingsChange({
      ...settings,
      providers: newProviders,
    });
  };

  // Function to load available models from the API
  const loadModels = async () => {
    if (!selectedProvider) {
      showAlert("Provider Required", "Please select a provider first");
      return;
    }

    if (!selectedProvider.apiKey) {
      showAlert("API Key Required", "Please enter your API key first");
      return;
    }

    // For custom provider, ensure endpoint is set
    if (
      (selectedProvider.provider === "custom" ||
        selectedProvider.provider === "local") &&
      !selectedProvider.endpoint
    ) {
      showAlert(
        "Endpoint Required",
        "Please enter the API endpoint for your custom or local provider."
      );
      return;
    }

    setLoading(true);
    try {
      const endpoint = selectedProvider.endpoint;

      // This is a simplified example - actual endpoint might be different based on the AI provider
      const response = await fetch(`${endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${selectedProvider.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load models: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract models from response (format varies by provider)
      const models = data.data || data.models || [];

      // Find the current provider by ID instead of the selectedProvider flag
      const providerType = selectedProvider.provider;

      // Update only the specific provider with the models, preserving all other providers
      const updatedProviders = settings.providers.map((provider) => {
        if (provider.provider === providerType) {
          return {
            ...provider,
            models: models.map((m) => m.id || m),
          };
        }
        return provider;
      });

      // Update settings with available models
      onSettingsChange({
        ...settings,
        providers: updatedProviders,
      });
    } catch (error) {
      console.error("Error loading models:", error);
      showAlert("Error", `Error loading models: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Select a model from the current provider
  const selectModel = (model) => {
    onSettingsChange({
      ...settings,
      selectedModel: model,
    });
  };

  // Function to remove a model from the current provider's list
  const removeModel = (modelToRemove) => {
    if (!selectedProvider) return;

    const newProviders = settings.providers.map((p) => {
      if (p.selectedProvider) {
        return {
          ...p,
          models: p.models.filter((model) => model !== modelToRemove),
        };
      }
      return p;
    });

    // If we're removing the currently selected model, deselect it
    let newSelectedModel = settings.selectedModel;
    if (settings.selectedModel === modelToRemove) {
      newSelectedModel = null;
    }

    onSettingsChange({
      ...settings,
      providers: newProviders,
      selectedModel: newSelectedModel,
    });
  };

  const handleSaveSettings = () => {
    // Only validate the current provider
    const provider = getSelectedProvider();

    // Only validate if there's a current provider
    if (provider) {
      // Only validate the provider if it has data - if it has no API key,
      // we'll still save it but it won't be usable
      if (
        provider.apiKey &&
        provider.provider === "custom" &&
        !provider.endpoint
      ) {
        showAlert(
          "Endpoint Required",
          "Please enter an endpoint for your custom provider."
        );
        return;
      }
    }

    // Filter out any providers with no API key before saving
    const providersToSave = settings.providers.filter((p) => p.apiKey);

    if (providersToSave.length === 0) {
      showAlert(
        "Provider Required",
        "Please configure at least one provider with an API key before saving."
      );
      return;
    }

    // Call the parent's save function
    onSaveSettings();
  };

  return (
    <div className="space-y-5">
      {/* Provider Selection */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold mb-4 text-gray-100">
            Provider Configuration
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleImportProviders}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportProviders}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>

            {/* Hidden file input for import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>
        </div>

        <hr />

        <div className="grid grid-cols-2 gap-2">
          {predefinedProviders.map((provider) => (
            <div
              key={provider.provider}
              className={`p-2 rounded-md cursor-pointer border flex items-center justify-center gap-2 ${
                selectedProvider?.provider === provider.provider
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
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
          value={selectedProvider?.apiKey || ""}
          onChange={(e) => updateProviderApiKey(e.target.value)}
          placeholder={
            selectedProvider?.provider === "local"
              ? "API Key (default: no-key)"
              : `Enter your ${selectedProvider?.name || "provider"} API key`
          }
        />
      </div>

      {/* Endpoint (for custom and local providers) */}
      {(selectedProvider?.provider === "custom" ||
        selectedProvider?.provider === "local") && (
        <div className="space-y-2">
          <Label htmlFor="endpoint">API Endpoint</Label>
          <Input
            id="endpoint"
            type="text"
            value={selectedProvider?.endpoint || ""}
            onChange={(e) => updateProviderEndpoint(e.target.value)}
            placeholder={
              selectedProvider?.provider === "local"
                ? "http://localhost:11434/v1"
                : "https://api.example.com/v1"
            }
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
            onClick={loadModels}
            disabled={loading || !selectedProvider?.apiKey}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Load Models
          </Button>
        </div>

        {selectedProvider?.models?.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 mt-2 overflow-y-auto scrollbar-thin pr-2 max-h-[300px]">
            {selectedProvider.models.map((model) => (
              <div
                key={safeToString(model)}
                className={`p-2 rounded-md border flex justify-between items-center ${
                  settings.selectedModel === model
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary"
                }`}
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
          <div className="text-muted-foreground text-sm">
            No models loaded. Click 'Load Models' to fetch available models.
          </div>
        )}
      </div>

      <Button onClick={handleSaveSettings} className="w-full mt-4">
        <Save className="h-4 w-4 mr-2" /> Save Settings
      </Button>
    </div>
  );
};

export default ProvidersConfig;
