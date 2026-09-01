"use client";

import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model output as Markdown.
 *
 * ## Safety
 *
 * This text is not fully trusted: the scanner and the risk register feed it
 * contract language pasted by the user, and the model may echo that back. Raw
 * HTML is therefore left off — react-markdown drops it by default, so
 * `<script>` and `<img onerror=…>` arrive as visible text rather than as
 * elements, and `defaultUrlTransform` rewrites `javascript:` hrefs to empty.
 * Verified empirically before wiring this up.
 *
 * **Do not add `rehype-raw`.** It exists to make raw HTML render, which is
 * exactly the property that keeps this safe.
 *
 * ## Styling
 *
 * Elements are mapped explicitly rather than with `@tailwindcss/typography`,
 * which is another dependency. The set below is what the AI tasks actually
 * emit — headings, bold, lists, tables, code, and rules.
 */

const components: Components = {
  h1: (props) => <h2 className="mt-4 text-sm font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mt-4 text-sm font-semibold first:mt-0" {...props} />,
  h3: (props) => (
    <h4
      className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0"
      {...props}
    />
  ),
  h4: (props) => <h5 className="mt-3 text-[13px] font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="mt-2 first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-2 list-disc space-y-0.5 pl-5 first:mt-0" {...props} />,
  ol: (props) => <ol className="mt-2 list-decimal space-y-0.5 pl-5 first:mt-0" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  hr: () => <hr className="my-3" />,
  blockquote: (props) => (
    <blockquote className="mt-2 border-l-[3px] border-border pl-3 text-muted-foreground" {...props} />
  ),
  code: (props) => (
    <code className="rounded-r4 bg-secondary px-1 py-0.5 font-mono text-[12px]" {...props} />
  ),
  pre: (props) => (
    <pre className="mt-2 overflow-x-auto rounded-r6 bg-secondary p-2 text-[12px]" {...props} />
  ),
  // Wide tables scroll inside their own container rather than pushing the
  // page sideways.
  table: (props) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]" {...props} />
    </div>
  ),
  th: (props) => (
    <th className="border-b bg-secondary px-2 py-1.5 text-left font-semibold align-top" {...props} />
  ),
  td: (props) => <td className="border-b px-2 py-1.5 align-top" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      // Model output can contain links to anywhere; deny the target page a
      // handle on this one.
      rel="noopener noreferrer nofollow"
      target="_blank"
      className="text-primary underline underline-offset-2"
      {...props}
    />
  ),
};

export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="text-[13px] leading-relaxed text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
