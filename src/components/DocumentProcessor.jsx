import React, { useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

// The pdf.worker.mjs file should be manually copied to your public folder.
try {
  // Try to resolve worker relative to this bundle (works in extension and web)
  const base = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL('')
    : '';
  GlobalWorkerOptions.workerSrc = (base ? base : '/') + 'pdf.worker.mjs';
} catch (_) {
  GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
}

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textContentToHtml(content) {
  // Group items into lines by Y coordinate and then join text
  const items = (content && Array.isArray(content.items)) ? content.items.slice() : [];
  if (items.length === 0) return '';
  // Sort by Y (desc), then X (asc)
  items.sort((a, b) => {
    const ay = (a.transform && a.transform[5]) || 0;
    const by = (b.transform && b.transform[5]) || 0;
    if (by !== ay) return by - ay;
    const ax = (a.transform && a.transform[4]) || 0;
    const bx = (b.transform && b.transform[4]) || 0;
    return ax - bx;
  });

  const lines = [];
  const epsilon = 2; // pixel tolerance for same line
  let currentY = null;
  let buffer = [];
  for (const it of items) {
    const y = Math.round((it.transform && it.transform[5]) || 0);
    if (currentY === null) {
      currentY = y;
    }
    if (Math.abs(y - currentY) > epsilon) {
      if (buffer.length > 0) lines.push(buffer.join(' '));
      buffer = [it.str];
      currentY = y;
    } else {
      buffer.push(it.str);
    }
  }
  if (buffer.length > 0) lines.push(buffer.join(' '));

  return lines.map(line => `<p>${escapeHtml(line)}</p>`).join('');
}

// Main document processing function
export const extractTextFromDocument = async (file) => {
  try {
    let markdown = '';
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    
    if (file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'))) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument(arrayBuffer).promise;
      let html = '<div class="pdf-document">';
      let plainTextFallback = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageHtml = textContentToHtml(content);
        html += `<section class="pdf-page" data-page="${i}">${pageHtml}</section>`;
        plainTextFallback += (content.items || []).map(item => item.str).join(' ') + '\n';
      }
      html += '</div>';
      markdown = turndown.turndown(html).trim();
      // Fallback to plain text if markdown is empty (e.g., scanned PDFs)
      if (!markdown) {
        markdown = plainTextFallback.trim();
      }
    }
    else if (file.type.includes('wordprocessingml') || file.name.endsWith('.docx') || file.type === 'application/msword' || file.name.endsWith('.doc')) {
      const arrayBuffer = await file.arrayBuffer();
      // Try full HTML conversion first for richer structure
      try {
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
        const html = `<div>${htmlResult.value}</div>`;
        markdown = turndown.turndown(html).trim();
      } catch (_) {}
      // Fallback to raw text if HTML path produced nothing
      if (!markdown) {
        const result = await mammoth.extractRawText({ arrayBuffer });
        const normalized = result.value.replace(/\n{3,}/g, '\n\n');
        const html = `<div>${escapeHtml(normalized).split('\n\n').map(p => `<p>${p}</p>`).join('')}</div>`;
        markdown = turndown.turndown(html).trim();
        if (!markdown) markdown = normalized.trim();
      }
    }
    else {
      const raw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
      const html = `<pre>${escapeHtml(raw)}</pre>`;
      markdown = turndown.turndown(html).trim();
      if (!markdown) markdown = String(raw || '').trim();
    }

    // Ensure we have at least a placeholder if nothing could be extracted
    if (!markdown) {
      markdown = '[No extractable text found. This file may be scanned or image-based.]';
    }

    const estimatedTotalTokens = Math.ceil(markdown.length / 4); // Simple character-based estimation (1 token ~ 4 chars)
    const chunks = splitIntoChunks(markdown);
    return {
      text: markdown,
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
      
      <div className={`text-muted-foreground overflow-hidden ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
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
