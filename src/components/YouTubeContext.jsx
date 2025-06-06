import React, { useState } from "react";

/**
 * Component to display YouTube video context with metadata
 */
export const YouTubeContext = ({ videoInfo, onClear }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!videoInfo || !videoInfo.type || videoInfo.type !== 'youtube') {
    return null;
  }
  
  // Extract video info
  const { title, description, channel, stats, videoId } = videoInfo;
  
  // Truncate description for display
  const displayDescription = isExpanded 
    ? description 
    : (description && description.length > 120 ? `${description.substring(0, 120)}...` : description);

  return (
    <div className="px-3 py-2 mb-2 bg-muted/50 rounded-md text-xs border border-border">
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24"
            className="mr-1 text-red-500"
            fill="currentColor"
          >
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
          </svg>
          <span className="text-primary">{title}</span>
        </span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={isExpanded ? "Show less" : "Show more"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isExpanded ? (
                <polyline points="18 15 12 9 6 15"></polyline>
              ) : (
                <polyline points="6 9 12 15 18 9"></polyline>
              )}
            </svg>
          </button>
          
          <button 
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear YouTube context"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Thumbnail preview */}
      {videoId && (
        <div className="mb-2 relative w-full rounded-md overflow-hidden" style={{ maxHeight: '120px' }}>
          <img 
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} 
            alt={title}
            className="w-full object-cover rounded-md"
          />
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24"
              className="text-white/90 opacity-80"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}
      
      {/* Description */}
      {description && (
        <div className={`text-muted-foreground ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
          {displayDescription}
        </div>
      )}
      
      {/* Channel and stats */}
      <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
        {channel && <span className="font-medium">{channel}</span>}
        {channel && stats && <span>•</span>}
        {stats && <span>{stats}</span>}
        <span>•</span>
        <a 
          href={`https://www.youtube.com/watch?v=${videoId}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Open on YouTube
        </a>
      </div>
    </div>
  );
};

export default YouTubeContext;
