import { Button } from "./ui/button";
import React, { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { Github } from "lucide-react";

const ExtentionInfo = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <span
        className="cursor-pointer px-4 py-1 border border-primary rounded-2xl text-primary hover:border-primary/80 hover:text-primary-foreground duration-200 transition-all"
        onClick={() => setOpen(true)}
      >
        v0.7.4
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogClose className={`absolute right-4 top-4 p-2 rounded-full hover:bg-background hover:border hover:border-red-300 hover:text-red-300 hover:rotate-12 duration-200 transition-all`}/>
        <DialogHeader>
          <DialogTitle className="absolute left-4 top-4 flex items-center gap-2">
            <img
              src={chrome.runtime.getURL('assets/icon128.png')}
              alt="Chat Box Extension Icon"
              className="w-8 h-8"
            />
            Chat Box
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-12 px-6">
          <div className="p-4 rounded-lg border">
            <h3 className="text-lg font-semibold mb-2">Version 0.7.4</h3>
            <div className="text-sm space-y-2">
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Fixed OpenRouter response error</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Added clear button to remove all provider configuration</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-semibold mb-2">Version 0.7.3</h3>
              <div className="text-sm space-y-2">
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>Added Ollama provider support</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>Added OpenRouter provider support</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>SDK framework integration for all providers in chat</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>Improved provider configuration and validation</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-semibold mb-2">Version 0.7.2</h3>
              <div className="text-sm space-y-2">
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>Improved chat experience</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>PDF support: HTML → Markdown conversion and smart chunking</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span>Saved API keys moved to IndexedDB (from local storage)</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-center">
            <a
              href="https://github.com/MinhxThanh/Chat-Box"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 border border-blue-500 px-2 py-1 rounded-md hover:underline text-sm flex items-center gap-2"
            >
              <Github /> Chat-Box
            </a>
            <a href="https://www.buymeacoffee.com/mr.thanh" target="_blank" rel="noopener noreferrer">
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                alt="Buy Me A Coffee"
                style={{ height: '33px', width: '110px' }}
              />
            </a>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ExtentionInfo;