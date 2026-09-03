'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? 'prose prose-sm dark:prose-invert max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-background/60 px-1 py-0.5 text-xs font-mono">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="rounded-md bg-background/60 p-2 overflow-x-auto text-xs mb-2">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ''}
                className="rounded-md max-w-full h-auto my-2 border border-border"
                loading="lazy"
              />
            ) : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
