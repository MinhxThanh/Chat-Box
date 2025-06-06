import React, { useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import mammoth from 'mammoth';

// The pdf.worker.mjs file should be manually copied to your public folder.
GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

// Semantic chunking function
const splitIntoChunks = (text, maxChunkSize = 2000, overlapSize = 200) => {
  if (!text) return [];
  if (text.length <= maxChunkSize) return [{ text, index: 0 }];

  const chunks = [];
  let i = 0;
  const sentenceEndings = /[.!?;\n]/g;
  const paragraphEndings = /\n\n+/g;

  while (i < text.length) {
    let endIndex = Math.min(i + maxChunkSize, text.length);
    let sliceStart = Math.max(0, endIndex - overlapSize * 2); // Look further back for breaks
    let slice = text.substring(sliceStart, endIndex);
    let breakIndex = -1;

    // Try paragraph breaks first (most semantic)
    let matches = Array.from(slice.matchAll(paragraphEndings));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      breakIndex = sliceStart + lastMatch.index + lastMatch[0].length;
    }

    // If no paragraph break, try sentence breaks
    if (breakIndex === -1 || breakIndex <= i) {
      matches = Array.from(slice.matchAll(sentenceEndings));
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        breakIndex = sliceStart + lastMatch.index + lastMatch[0].length;
      }
    }

    // If still no good break, or break is too early, take maxChunkSize or remaining text
    if (breakIndex === -1 || breakIndex <= i) {
      endIndex = Math.min(i + maxChunkSize, text.length);
    } else {
      endIndex = breakIndex;
    }
    
    // Ensure endIndex does not exceed text length
    endIndex = Math.min(endIndex, text.length);

    chunks.push({ text: text.substring(i, endIndex), index: chunks.length });
    i = Math.max(i + 1, endIndex - overlapSize); // Ensure progress and overlap
  }
  return chunks;
};

// Main document processing function
export const extractTextFromDocument = async (file) => {
  try {
    let text = '';
    
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument(arrayBuffer).promise;
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
    }
    else if (file.type.includes('wordprocessingml') || file.name.endsWith('.docx') || file.type === 'application/msword' || file.name.endsWith('.doc')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      text = result.value.replace(/\n{3,}/g, '\n\n');
    }
    else {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    const estimatedTotalTokens = Math.ceil(text.length / 4); // Simple character-based estimation (1 token ~ 4 chars)
    const chunks = splitIntoChunks(text);
    return {
      chunks,
      metadata: {
        filename: file.name,
        fileType: file.type, // Use fileType consistently
        size: file.size,
        totalChunks: chunks.length, // Use totalChunks consistently
        estimatedTotalTokens: estimatedTotalTokens,
        processedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Document processing failed:', error);
    throw new Error(`Processing failed: ${error.message}`);
  }
};

// Document context UI component (adapted to match existing props and style)
export const DocumentContext = ({ documentName, documentContent, totalChunks, onClearDocument }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!documentName || !documentContent) return null;

  // Use totalChunks prop directly as it's passed from Chat.jsx
  const actualTotalChunks = totalChunks;
  const chunkInfo = actualTotalChunks > 1 ? 
    `${actualTotalChunks} chunks` : 
    'Single document';
  
  const currentChunkText = documentContent.chunks && documentContent.chunks[0] ? 
    documentContent.chunks[0].text : 
    (documentContent.text || 'No content available.'); // Fallback to documentContent.text if chunks[0] is not available
  
  const displayContent = isExpanded ? 
    currentChunkText : 
    (currentChunkText.length > 120 ? `${currentChunkText.substring(0, 120)}...` : currentChunkText);

  return (
    <div className="px-3 py-2 mb-2 bg-muted/50 rounded-md text-xs border border-border">
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium">
          Chatting with document: <span className="text-primary">{documentName}</span>

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
            onClick={onClearDocument}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear document"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div className={`text-muted-foreground ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
        {displayContent}
      </div>
      
      {documentContent.metadata && (
        <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2">
          {/* <span>{documentContent.metadata.fileType}</span> */}
          <span>•</span>
          <span>{(documentContent.metadata.size / 1024).toFixed(1)}KB</span>
          <span>•</span>
          {typeof documentContent.metadata.estimatedTotalTokens === 'number' && (
            <>
              <span>{documentContent.metadata.estimatedTotalTokens} tokens (est.)</span>
              <span>•</span>
            </>
          )}
          <span>{chunkInfo}</span>
        </div>
      )}
    </div>
  );
};
