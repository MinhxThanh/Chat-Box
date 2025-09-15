import React, { useState, useMemo } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Minus } from 'lucide-react';
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from './ui/toast';

const AdvancedSettings = ({ settings, onSettingsChange }) => {
  const quickActionsEnabled = !!settings.quickActionsEnabled;
  const blocklist = Array.isArray(settings.quickActionsBlocklist)
    ? settings.quickActionsBlocklist
    : [];

  const [newEntry, setNewEntry] = useState('');
  const [toastState, setToastState] = useState({ open: false, title: '', description: '', variant: 'default' });

  const normalizedBlocklist = useMemo(() => blocklist.filter(Boolean), [blocklist]);

  const handleToggle = (checked) => {
    onSettingsChange({
      ...settings,
      quickActionsEnabled: !!checked,
    });
    setToastState({
      open: true,
      title: 'Quick Actions',
      description: checked ? 'Enabled on-page quick actions' : 'Disabled on-page quick actions',
      variant: 'default'
    });
  };

  const addEntry = () => {
    const value = (newEntry || '').trim();
    if (!value) return;
    if (normalizedBlocklist.includes(value)) {
      setNewEntry('');
      setToastState({ open: true, title: 'Blocklist', description: 'This entry already exists', variant: 'default' });
      return;
    }
    onSettingsChange({
      ...settings,
      quickActionsBlocklist: [...normalizedBlocklist, value],
    });
    setNewEntry('');
    setToastState({ open: true, title: 'Blocklist', description: 'Added to blocked websites', variant: 'default' });
  };

  const removeEntry = (idx) => {
    const updated = normalizedBlocklist.filter((_, i) => i !== idx);
    onSettingsChange({
      ...settings,
      quickActionsBlocklist: updated,
    });
    setToastState({ open: true, title: 'Blocklist', description: 'Removed from blocked websites', variant: 'default' });
  };

  return (
    <ToastProvider>
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-secondary p-3 rounded-md">
        <div>
          <div className="font-medium">Switch display Quick Actions</div>
          <div className="text-xs opacity-70">Turn on/off the on-page quick actions</div>
        </div>
        <Switch checked={quickActionsEnabled} onCheckedChange={handleToggle} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Blocked websites</div>
        <div className="text-xs opacity-70">Quick Actions will be disabled on URLs or domains below.</div>
        <div className="flex gap-2">
          <Input
            placeholder="Add URL or domain (e.g. example.com or https://example.com/path)"
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
          />
          <Button onClick={addEntry}>Add</Button>
        </div>

        <div className="space-y-1">
          {normalizedBlocklist.length === 0 && (
            <div className="text-xs opacity-60">No blocked websites</div>
          )}
          {normalizedBlocklist.map((item, idx) => (
            <div key={`${item}-${idx}`} className="flex items-center justify-between bg-secondary p-2 rounded">
              <div className="truncate mr-2" title={item}>{item}</div>
              <Button variant="ghost" size="sm" onClick={() => removeEntry(idx)}><Minus className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </div>

      {/* Toasts */}
      <Toast
        open={toastState.open}
        onOpenChange={(open) => setToastState(prev => ({ ...prev, open }))}
        variant={toastState.variant}
        duration={2500}
      >
        <div className="grid gap-1">
          <ToastTitle>{toastState.title}</ToastTitle>
          {toastState.description && (
            <ToastDescription>{toastState.description}</ToastDescription>
          )}
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </div>
    </ToastProvider>
  );
};

export default AdvancedSettings;


