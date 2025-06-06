import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Brain, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

// Basic markdown renderer with syntax highlighting
export const Markdown = ({ content, className }) => {
  const [showThinking, setShowThinking] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  
  // Function to safely get content as string
  const getContentAsString = (content) => {
    if (content === null || content === undefined) {
      return '';
    }
    
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content
        .filter(item => item && item.type === 'text')
        .map(item => item.text || '')
        .join('\n');
    }
    
    // For objects or other types, try to stringify
    try {
      return JSON.stringify(content);
    } catch (e) {
      console.error('Failed to stringify content', e);
      return 'Content cannot be displayed';
    }
  };
  
  // Function to copy code to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedCode(text);
        setTimeout(() => setCopiedCode(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };
  
  // Convert markdown to React elements
  const renderMarkdown = (inputContent) => {
    if (inputContent === null || inputContent === undefined) return null;
    
    // Convert content to string safely
    const text = getContentAsString(inputContent);    
    if (!text) return null;
    
    // Process thinking blocks first
    let hasThinkingContent = false;
    let thinkingContent = null;
    let mainContent = text;
    
    // Check for <think></think> tags
    const thinkingMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkingMatch) {
      hasThinkingContent = true;
      thinkingContent = thinkingMatch[1].trim();
      // Remove the thinking block from the main content
      mainContent = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    // Process content function (used for both main content and thinking content)
    const processContent = (content) => {
      if (!content) return null;
      
      // Ensure content is a string
      const contentStr = typeof content === 'string' ? content : String(content);
      
      return contentStr.split(/```([\s\S]*?)```/).map((part, index) => {
        // Code blocks will be at odd indices
        if (index % 2 === 1) {
          // Check if the code block has a language specifier
          const firstLineEnd = part.indexOf('\n');
          let language = '';
          let code = part;
          
          if (firstLineEnd > 0) {
            language = part.substring(0, firstLineEnd).trim();
            code = part.substring(firstLineEnd + 1);
          }
          
          return (
            <div key={index} className="relative group my-2 bg-[#000000]">
              <div className="absolute right-2 top-[0.7rem] opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => copyToClipboard(code)}
                  className="p-1.5 rounded bg-secondary-foreground/10 hover:bg-secondary-foreground/20 transition-colors"
                  title="Copy code"
                >
                  {copiedCode === code ? 
                    <Check size={14} className="text-green-400" /> : 
                    <Copy size={14} className="text-secondary-foreground/70" />}
                </button>
              </div>
              
              <div className="bg-secondary/30 text-xs px-4 py-4 border-b border-secondary-foreground/10 flex items-center">
                <span className="font-mono uppercase">{language || 'code'}</span>
              </div>
              
              <pre className="overflow-x-auto no-scrollbar p-4 rounded-b-md bg-[#191919] m-0">
                <code className={`language-${language}`}>{code}</code>
              </pre>
            </div>
          );
        }
        
        // Process regular text with inline formatting
        return (
          <React.Fragment key={`part-${index}`}>
            {part.split('\n').map((line, lineIndex) => {
              // Create a unique key for each line that combines the part index and line index
              const uniqueLineKey = `part-${index}-line-${lineIndex}`;
              // Check for tables
              if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                // This might be a table row
                const cells = line.trim().split('|').filter(cell => cell !== '');
                // Check if this is a header separator row
                const isHeaderSeparator = cells.every(cell => cell.trim().startsWith('-') && cell.trim().endsWith('-'));
                
                if (isHeaderSeparator) {
                  // This is a table header separator line, skip rendering it
                  return null;
                }
                
                // Determine if this is a header row based on its position
                // Usually header rows come before separator rows
                const isHeader = lineIndex > 0 && 
                  part.split('\n')[lineIndex + 1] && 
                  part.split('\n')[lineIndex + 1].trim().startsWith('|') && 
                  part.split('\n')[lineIndex + 1].trim().endsWith('|') &&
                  part.split('\n')[lineIndex + 1].includes('---');
                
                return (
                  <div key={uniqueLineKey} className="overflow-x-auto no-scrollbar my-4">
                    <table className="w-full border-collapse">
                      {isHeader && (
                        <thead>
                          <tr>
                            {cells.map((cell, cellIndex) => (
                              <th 
                                key={`${uniqueLineKey}-th-${cellIndex}`} 
                                className="p-2 text-left border-b-2 border-secondary-foreground/20 font-medium"
                              >
                                {processInlineFormatting(cell.trim(), `${uniqueLineKey}-th-${cellIndex}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      {!isHeader && (
                        <tbody>
                          <tr>
                            {cells.map((cell, cellIndex) => (
                              <td 
                                key={`${uniqueLineKey}-td-${cellIndex}`} 
                                className="p-2 border-b border-secondary-foreground/10"
                              >
                                {processInlineFormatting(cell.trim(), `${uniqueLineKey}-td-${cellIndex}`)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      )}
                    </table>
                  </div>
                );
              }
              
              // Check for quote blocks
              if (line.startsWith('> ')) {
                return (
                  <blockquote key={uniqueLineKey} className="pl-4 border-l-2 border-primary/50 italic text-secondary-foreground/80 my-2">
                    {processInlineFormatting(line.substring(2), uniqueLineKey)}
                  </blockquote>
                );
              }
              
              // Check for numbered lists and extract the number
              const numberedListMatch = line.match(/^(\d+)\.\s+(.*)/);
              if (numberedListMatch) {
                const number = parseInt(numberedListMatch[1]);
                const content = numberedListMatch[2];
                
                // Process the content after the number separately
                return (
                  <ol key={uniqueLineKey} className="ml-4 list-decimal" start={number}>
                    <li key={`${uniqueLineKey}-item`}>{processInlineFormatting(content, uniqueLineKey)}</li>
                  </ol>
                );
              }
              
              // Check for horizontal rule
              if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
                return <hr key={uniqueLineKey} className="my-4 border-t border-secondary-foreground/20" />;
              }
              
              // Process other markdown elements
              if (line.startsWith('# ')) {
                return <h1 key={uniqueLineKey} className="text-2xl font-bold mt-6 mb-3">{processInlineFormatting(line.substring(2).trim(), uniqueLineKey)}</h1>;
              } else if (line.startsWith('## ')) {
                return <h2 key={uniqueLineKey} className="text-xl font-bold mt-5 mb-2.5">{processInlineFormatting(line.substring(3).trim(), uniqueLineKey)}</h2>;
              } else if (line.startsWith('### ')) {
                return <h3 key={uniqueLineKey} className="text-lg font-bold mt-4 mb-2">{processInlineFormatting(line.substring(4).trim(), uniqueLineKey)}</h3>;
              } else if (line.startsWith('#### ')) {
                return <h4 key={uniqueLineKey} className="text-base font-bold mt-3.5 mb-1.5">{processInlineFormatting(line.substring(5).trim(), uniqueLineKey)}</h4>;
              } else if (line.startsWith('##### ')) {
                return <h5 key={uniqueLineKey} className="text-sm font-bold mt-3 mb-1">{processInlineFormatting(line.substring(6).trim(), uniqueLineKey)}</h5>;
              } else if (line.startsWith('###### ')) {
                return <h6 key={uniqueLineKey} className="text-xs font-bold mt-2.5 mb-1">{processInlineFormatting(line.substring(7).trim(), uniqueLineKey)}</h6>;
              } else if (line.match(/^\s*-\s/)) {
                // Handle bullet lists with indentation for nesting
                const indentMatch = line.match(/^(\s*)-\s(.*)/);
                if (indentMatch) {
                  const indentLevel = Math.floor(indentMatch[1].length / 2); // Calculate nesting level based on spaces
                  const content = indentMatch[2];
                  
                  // Apply different classes based on indent level
                  let indentClass = "ml-4 list-disc";
                  let indentStyle = {};
                  
                  if (indentLevel >= 1) {
                    // For nested levels, use inline style to ensure proper indentation
                    indentClass = "list-disc";
                    indentStyle = { 
                      marginLeft: `${1 + indentLevel}rem`,
                      paddingLeft: "0.5rem"
                    };
                  }
                  
                  return (
                    <li 
                      key={uniqueLineKey} 
                      className={indentClass}
                      style={indentStyle}
                    >
                      {processInlineFormatting(content)}
                    </li>
                  );
                }
                return <li key={uniqueLineKey} className="ml-4 list-disc">{processInlineFormatting(line.substring(2), uniqueLineKey)}</li>;
              } else if (line.trim() === '') {
                return <br key={uniqueLineKey} />;
              }
              
              return <p key={uniqueLineKey} className="mb-2">{processInlineFormatting(line, uniqueLineKey)}</p>;
            })}
          </React.Fragment>
        );
      });
    };
    
    // Helper function to process inline formatting (code, bold, italic, links)
    const processInlineFormatting = (text, parentKey = '') => {
      if (!text) return null;
      
      // Process inline code
      // Ensure text is a string
      const safeText = typeof text === 'string' ? text : String(text || '');
      const elements = safeText.split(/`([^`]+)`/).map((segment, segIndex) => {
        const codeKey = `${parentKey}-code-${segIndex}`;
        if (segIndex % 2 === 1) {
          return <code key={codeKey} className="px-1 py-0.5 rounded-sm bg-secondary">{segment}</code>;
        }
        
        // Process bold text
        const boldProcessed = segment.split(/\*\*([^*]+)\*\*/).map((boldSeg, boldIndex) => {
          const boldKey = `${parentKey}-bold-${segIndex}-${boldIndex}`;
          if (boldIndex % 2 === 1) {
            return <strong key={boldKey}>{boldSeg}</strong>;
          }
          
          // Process italic text
          const italicProcessed = boldSeg.split(/\*([^*]+)\*/).map((italicSeg, italicIndex) => {
            const italicKey = `${parentKey}-italic-${segIndex}-${boldIndex}-${italicIndex}`;
            if (italicIndex % 2 === 1) {
              return <em key={italicKey}>{italicSeg}</em>;
            }
            
            // Process links
            const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
            let lastIndex = 0;
            let match;
            const linkProcessed = [];
            let plainText = italicSeg;
            
            while ((match = linkRegex.exec(italicSeg)) !== null) {
              if (match.index > lastIndex) {
                linkProcessed.push(italicSeg.substring(lastIndex, match.index));
              }
              
              linkProcessed.push(
                <a
                  key={`${parentKey}-link-${segIndex}-${boldIndex}-${italicIndex}-${match.index}`}
                  href={match[2]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  {match[1]}
                </a>
              );
              
              lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < italicSeg.length) {
              linkProcessed.push(italicSeg.substring(lastIndex));
            }
            
            return linkProcessed.length > 0 ? linkProcessed : plainText;
          });
          
          return italicProcessed;
        });
        
        return boldProcessed;
      });
      
      return elements;
    };
    
    // Render main content and thinking content if available
    return (
      <div className="markdown-content relative z-10">        
        {hasThinkingContent && (
          <div className="mt-2 border border-border rounded-md overflow-hidden">
            <button 
              onClick={() => setShowThinking(!showThinking)}
              className="w-full flex items-center justify-between p-2 bg-muted hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-center gap-y-2 text-xs font-medium">
                <Brain size={14} className="text-white mr-2" />
                <span>AI Thinking Process</span>
              </div>
              {showThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            
            {showThinking && (
              <div className="p-3 text-xs bg-muted/30 border-t border-border">
                {processContent(thinkingContent)}
              </div>
            )}
          </div>
        )}
        
        <div className="relative z-10">
          {processContent(mainContent)}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('markdown-content', className)}>
      {renderMarkdown(content)}
    </div>
  );
};
