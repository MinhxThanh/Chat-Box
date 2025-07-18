import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { Atom, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

// --- Components --- //

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  if (inline) {
    return <code className="px-1 py-0.5 rounded-sm bg-muted text-muted-foreground">{children}</code>;
  }

  return (
    <div className="relative group my-4 bg-black rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-mono uppercase text-muted-foreground">{lang}</span>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md bg-transparent hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Copy code"
        >
          {isCopied ? (
            <Check size={14} className="text-green-500" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={lang}
        PreTag="div"
        {...props}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

const ThinkingBlock = ({ content }) => {
  const [showThinking, setShowThinking] = useState(false);

  if (!content) return null;

  return (
    <div className="mb-2 border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setShowThinking(!showThinking)}
        className="w-full flex items-center justify-between p-2 bg-muted hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <Atom size={14} />
          <span>Thinking Process</span>
        </div>
        {showThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {showThinking && (
        <div className="p-3 text-xs bg-muted/30 border-t border-border">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
};

const MarkdownRenderer = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlock,
        h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-primary" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-2.5 text-primary" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2 text-primary" {...props} />,
        h4: ({ node, ...props }) => <h4 className="text-base font-bold mt-3 mb-1.5 text-primary" {...props} />,
        h5: ({ node, ...props }) => <h5 className="text-sm font-bold mt-2 mb-1 text-primary" {...props} />,
        h6: ({ node, ...props }) => <h6 className="text-xs font-bold mt-2 mb-1 text-primary" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-bold text-primary" {...props} />,
        p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
        a: ({ node, ...props }) => <a className="text-primary hover:underline" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-4" {...props} />,
        li: ({ node, ...props }) => <li className="mb-2" {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="pl-4 border-l-2 border-border italic text-muted-foreground my-4" {...props} />,
        hr: ({ node, ...props }) => <hr className="my-6 border-border" {...props} />,
        table: ({ node, ...props }) => <div className="overflow-x-auto"><table className="w-full my-4 border-collapse" {...props} /></div>,
        thead: ({ node, ...props }) => <thead className="border-b-2 border-border" {...props} />,
        th: ({ node, ...props }) => <th className="p-2 text-left font-semibold" {...props} />,
        td: ({ node, ...props }) => <td className="p-2 border-b border-border" {...props} />,
        pre: ({ node, ...props }) => <pre className="p-0" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

// --- Main Component --- //

export const Markdown = ({ content, className }) => {
  const getContentAsString = (content) => {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(item => item && item.type === 'text')
        .map(item => item.text || '')
        .join('\n');
    }
    try {
      return JSON.stringify(content);
    } catch (e) {
      console.error('Failed to stringify content', e);
      return 'Content cannot be displayed';
    }
  };

  const text = getContentAsString(content);
  if (!text) return null;

  const thinkingMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : null;
  const mainContent = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return (
    <div className={cn('markdown-content', className)}>
      <ThinkingBlock content={thinkingContent} />
      <MarkdownRenderer content={mainContent} />
    </div>
  );
};
