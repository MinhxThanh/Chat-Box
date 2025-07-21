import React, { useState, useEffect, useRef } from 'react';
import { addPrompt, getAllPrompts, updatePrompt, deletePrompt } from '../db/promptDb';
import { useNotification } from '../context/NotificationContext';
import { Pencil, Trash2, Download, Upload } from 'lucide-react';
import { Button } from './ui/button';

const CustomPrompts = () => {
  const [prompts, setPrompts] = useState([]);
  const [title, setTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [command, setCommand] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(null);
  const { showAlert } = useNotification();
  const [showForm, setShowForm] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const allPrompts = await getAllPrompts();
      setPrompts(allPrompts);
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
      showAlert('Error', 'Failed to load prompts. Please try again.');
    }
  };

  const handleExport = async () => {
    try {
      const allPrompts = await getAllPrompts();
      const exportData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        prompts: allPrompts.map(({ id, ...prompt }) => prompt) // Remove id for export
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `custom-prompts-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      showAlert('Success', 'Prompts exported successfully!');
    } catch (error) {
      console.error('Failed to export prompts:', error);
      showAlert('Error', 'Failed to export prompts. Please try again.');
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate import data structure
      if (!importData.prompts || !Array.isArray(importData.prompts)) {
        throw new Error('Invalid file format: missing prompts array');
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const promptData of importData.prompts) {
        // Validate required fields
        if (!promptData.title || !promptData.prompt) {
          skippedCount++;
          continue;
        }

        try {
          await addPrompt({
            title: promptData.title,
            command: promptData.command || '',
            prompt: promptData.prompt
          });
          importedCount++;
        } catch (error) {
          console.error('Failed to import prompt:', promptData.title, error);
          skippedCount++;
        }
      }

      await fetchPrompts();

      if (importedCount > 0) {
        let message = `Successfully imported ${importedCount} prompt(s)`;
        if (skippedCount > 0) {
          message += `. Skipped ${skippedCount} prompt(s) due to errors or missing data.`;
        }
        showAlert('Success', message);
      } else {
        showAlert('Warning', 'No valid prompts found in the file.');
      }

    } catch (error) {
      console.error('Failed to import prompts:', error);
      showAlert('Error', 'Failed to import prompts. Please check the file format and try again.');
    }

    // Reset file input
    event.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingPrompt) {
      try {
        await updatePrompt(editingPrompt.id, { title, command, prompt: promptContent });
        showAlert('Success', 'Prompt updated successfully!');
      } catch (error) {
        console.error('Failed to update prompt:', error);
        showAlert('Error', 'Failed to update prompt. Please try again.');
        return;
      }
    } else {
      try {
        await addPrompt({ title, command, prompt: promptContent });
        showAlert('Success', 'Prompt added successfully!');
      } catch (error) {
        console.error('Failed to add prompt:', error);
        showAlert('Error', 'Failed to add prompt. Please try again.');
        return;
      }
    }
    setShowForm(false);
    setTitle('');
    setCommand('');
    setPromptContent('');
    setEditingPrompt(null);
    fetchPrompts();
    setTitle('');
    setCommand('');
    setPromptContent('');
    setEditingPrompt(null);
    fetchPrompts();
  };

  const handleEdit = (prompt) => {
    setEditingPrompt(prompt);
    setTitle(prompt.title);
    setCommand(prompt.command || '');
    setPromptContent(prompt.prompt);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    showAlert(
      'Confirm Deletion',
      'Are you sure you want to delete this prompt?',
      async () => {
        await deletePrompt(id);
        showAlert('Success', 'Prompt deleted successfully!');
        fetchPrompts();
      },
      true // showCancel
    );
  };

  const cancelEdit = () => {
    setShowForm(false);
    setEditingPrompt(null);
    setTitle('');
    setPromptContent('');
    setCommand('');
  };

  return (
    <div className="space-y-6 text-gray-200">
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button onClick={handleImport} variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" /> Import
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
        <Button onClick={() => setShowForm(prev => !prev)} variant="outline">
          New Prompt
        </Button>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {
        showForm && (
          <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700/50 transition-all duration-600 transform ease-in-out">
            <h2 className="text-xl font-semibold mb-4 text-white">{editingPrompt ? 'Edit Prompt' : 'Add New Prompt'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md shadow-sm px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., JavaScript Expert"
                />
              </div>
              <div>
                <label htmlFor="command" className="block text-sm font-medium text-gray-400 mb-1">Command</label>
                <input
                  type="text"
                  id="command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md shadow-sm px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., jsexpert"
                />
              </div>
              <div>
                <label htmlFor="promptContent" className="block text-sm font-medium text-gray-400 mb-1">Prompt Content</label>
                <textarea
                  id="promptContent"
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.target.value)}
                  rows="5"
                  className="w-full bg-gray-800 border border-gray-700 rounded-md shadow-sm px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="You are a JavaScript expert with 10 years of experience..."
                />
              </div>
              <div className="flex justify-end items-center space-x-3 pt-2">
                <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
                  {editingPrompt ? 'Update Prompt' : 'Add Prompt'}
                </button>
              </div>
            </form>
          </div>
        )
      }

      <hr />

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Your Prompts</h3>
        {prompts.length > 0 ? (
          <ul className="space-y-3">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="p-4 bg-gray-900/50 cursor-pointer rounded-lg border border-gray-700/50 flex justify-between items-center transform ease-in-out duration-600 transition-all hover:border-gray-600">
                <div className="flex-1 pr-4 overflow-hidden">
                  <div className="flex items-center gap-x-2">
                    <p className="font-semibold text-white">{prompt.title}</p>
                    {prompt.command && <p className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">/{prompt.command}</p>}
                  </div>
                  <p className="text-sm text-gray-400 mt-1 truncate">{prompt.prompt.slice(0, 50) + '...'}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button onClick={() => handleEdit(prompt)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(prompt.id)} className="p-1.5 text-red-500 hover:text-red-400 hover:bg-gray-700 rounded-md transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 px-4 bg-gray-900/50 rounded-lg border border-dashed border-gray-700/50">
            <p className="text-gray-400">You haven't added any prompts yet.</p>
            <p className="text-sm text-gray-500 mt-1">Use the form above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomPrompts;
