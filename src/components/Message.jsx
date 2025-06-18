import React, { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "../lib/utils";
import { Markdown } from "./Markdown";
import { Copy, RefreshCw, Edit, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { WELCOME_MESSAGE } from "../utils/prompts";

export const Message = ({ message, imageUrls, isUser, isStreaming, onRedoMessage, onEditMessage, isLatestUserMessage }) => {
  // Create a stable message ID to help React with keys
  const [messageId] = useState(() => `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  const [isHovering, setIsHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);
  
  // Handle different content formats (string or array with text/image objects)
  const isContentArray = Array.isArray(message.content);
  
  // Get text content for display
  const getTextContent = () => {
    if (isContentArray) {
      // If content is an array, extract text parts
      const textParts = message.content
        .filter(item => item.type === 'text')
        .map(item => item.text);
      return textParts.join('\n');
    }
    // If content is a string, return it directly
    return message.content;
  };
  
  // Check if message contains images
  const hasImages = isContentArray && message.content.some(item => item.type === 'image_url' || item.type === 'image_ref');
  
  // Get message content as string for length checking and display
  const textContent = getTextContent();
  const isLongMessage = textContent.length > 150;
  const displayMessage = isLongMessage && !isExpanded 
    ? `${textContent.substring(0, 150)}...` 
    : textContent;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [isEditing]);

  const handleEditSave = () => {
    if (editedContent.trim() === '') return;
    onEditMessage(message, editedContent);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditedContent(message.content);
    }
  };
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // You could add a toast notification here if desired
        console.log('Content copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  return (
    <div
      className={cn(
        "flex w-full mb-4 relative",
        isUser ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div
        className={cn(
          "rounded-lg px-4 py-2 max-w-[80%] shadow-md",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-secondary text-secondary-foreground rounded-bl-none border border-secondary/30"
        )}
      >
        {isUser ? (
          isEditing ? (
            <div className="w-full">
              <textarea
                ref={textareaRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-sm bg-transparent text-primary-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary-foreground/50 rounded p-1 min-h-[80px]"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedContent(textContent);
                  }}
                  className="p-1 text-primary-foreground/70 hover:text-primary-foreground transition rounded-md hover:bg-primary-foreground/10"
                  title="Cancel"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleEditSave}
                  className="p-1 text-primary-foreground/70 hover:text-primary-foreground transition rounded-md hover:bg-primary-foreground/10"
                  title="Save changes"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full">
              {/* Display text content */}
              <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
              
              {/* Display image thumbnails if present */}
              {hasImages && (
                <div className="mt-2">
                  {message.content.map((item, i) => {
                    if (item.type === 'image_url') {
                      return (
                        <div key={`image-content-${i}`} className="mt-1 rounded overflow-hidden inline-block border border-primary/20">
                          <img
                            src={item.image_url.url}
                            alt="Uploaded image"
                            className="max-h-[150px] max-w-full object-cover"
                          />
                        </div>
                      );
                    }
                    if (item.type === 'image_ref') {
                      const refUrl = imageUrls[item.imageId];
                      if (!refUrl) return null;
                      return (
                        <div key={`image-content-${i}`} className="mt-1 rounded overflow-hidden inline-block border border-primary/20">
                          <img
                            src={refUrl}
                            alt="Uploaded image"
                            className="max-h-[150px] max-w-full object-cover"
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
              
              <div className="flex items-center justify-end gap-2 mt-2">
                {isLongMessage && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground transition"
                  >
                    {isExpanded ? (
                      <>
                        <span>See less</span>
                        <ChevronUp size={14} />
                      </>
                    ) : (
                      <>
                        <span>See more</span>
                        <ChevronDown size={14} />
                      </>
                    )}
                  </button>
                )}
                
                {isLatestUserMessage && isHovering && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 text-primary-foreground/70 hover:text-primary-foreground transition rounded-md hover:bg-primary-foreground/10"
                    title="Edit message"
                  >
                    <Edit size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="text-sm">
            {/* Handle both string content and array content */}
            {Array.isArray(message.content) ? (
              <>
                {/* Display text parts */}
                {message.content.filter(item => item.type === 'text').map((item, i) => (
                  <div key={`text-part-${i}`}>
                    <Markdown content={item.text} />
                  </div>
                ))}
                
                {/* Display image parts */}
                {message.content.filter(item => item.type === 'image_url' || item.type === 'image_ref').map((item, i) => {
                  const imageUrl = item.type === 'image_ref' ? imageUrls[item.imageId] : item.image_url.url;
                  if (!imageUrl) return null; // Don't render if URL is not loaded yet
                  return (
                    <div key={`img-part-${i}`} className="mt-2 mb-2">
                      <div className="rounded overflow-hidden border border-secondary-foreground/20">
                        <img
                          src={imageUrl}
                          alt="From user"
                          className="max-h-[200px] max-w-full object-contain"
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <Markdown content={message.content} />
            )}
            
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary-foreground animate-pulse"></span>
            )}
            
            {!isStreaming && (
              <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-secondary-foreground/20">
                <button 
                  onClick={() => copyToClipboard(message.content)}
                  className="p-1 text-secondary-foreground/70 hover:text-secondary-foreground transition rounded-md hover:bg-secondary-foreground/10"
                  title="Copy message"
                >
                  <Copy size={16} />
                </button>
                {onRedoMessage && (
                  <button 
                    onClick={() => onRedoMessage(message)}
                    className="p-1 text-secondary-foreground/70 hover:text-secondary-foreground transition rounded-md hover:bg-secondary-foreground/10"
                    title="Regenerate response"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const SystemMessage = ({ children }) => {
  return (
    <div className={`text-center my-2 py-1 px-2 rounded-md z-10 relative ${children === WELCOME_MESSAGE ? 'hidden' : 'bg-muted/20 text-xs text-muted-foreground '}`}>
      {children}
    </div>
  );
};

export const DeleteConfirmDialog = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background border border-border rounded-lg max-w-md w-full p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
