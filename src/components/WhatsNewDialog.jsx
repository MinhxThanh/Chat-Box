import React from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import pinExtension from '../../assets/videos/pin-extension.mp4';

const WhatsNewDialog = ({ open, onOpenChange }) => {
  if (!open) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="border">
      <div className="p-6 max-w-2xl w-full mx-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            What's New?
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 space-y-4">
          <div className="bg-primary/10 p-4 rounded-lg border">
            <h3 className="font-semibold text-lg text-primary mb-2">
              Version 0.7.1
            </h3>
            <div className="text-sm space-y-2">
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Improved chat experience</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Improved Quick Actions</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Added support for custom models via manual entry</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>New Advanced Settings to control Quick Actions and set up a website blocklist</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Added Quick Summary Button</span>
              </div>
            </div>
          </div>

          <div className="space-y-1 mt-1">
            <p className="text-sm text-muted-foreground">
              Pin the extension to your browser toolbar for quick access:
            </p>
            
            <div className="w-full rounded-lg">
              <video 
                width="100%" 
                height="auto" 
                autoPlay 
                muted 
                loop
                className="rounded border max-h-64 object-contain"
                onError={(e) => {
                  console.log('Video failed to load:', e);
                  e.target.style.display = 'none';
                  const fallback = e.target.nextElementSibling;
                  if (fallback) fallback.style.display = 'block';
                }}
              >
                <source src={pinExtension} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              
              <p className="text-sm text-muted-foreground">More information about the extension can be found on the <a href="https://github.com/MinhxThanh/Chat-Box" target="_blank" className="text-primary">Chat Box</a> website.</p>

              <div 
                className="hidden text-center text-sm text-muted-foreground p-4 border rounded"
                style={{ display: 'none' }}
              >
                <p>📌 To pin the extension:</p>
                <p>1. Click the extensions icon (puzzle piece) in your browser toolbar</p>
                <p>2. Find "Chat Box" and click the pin icon next to it</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => onOpenChange(false)} className="px-6">
            Got it!
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default WhatsNewDialog; 