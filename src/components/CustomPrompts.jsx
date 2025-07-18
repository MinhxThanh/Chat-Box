import React, { useState, useEffect } from 'react';
import { addPrompt, getAllPrompts, updatePrompt, deletePrompt } from '../db/promptDb';
import { useNotification } from '../context/NotificationContext';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

const CustomPrompts = () => {
  const [prompts, setPrompts] = useState([]);
  const [title, setTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [command, setCommand] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(null);
  const { showAlert } = useNotification();
  const [showForm, setShowForm] = useState(false);

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
        <h2 className="text-xl font-semibold mb-4 text-white">Custom Prompts</h2>
        <Button onClick={() => setShowForm(prev => !prev)} variant="outline">New Prompt</Button>
      </div>

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
