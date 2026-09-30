"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

const IDEAS = [
  ["Product announcement", "Share what is new and why it matters."],
  ["Behind the scenes", "Show the people and process behind your work."],
  ["Client testimonial", "Highlight a transformation or customer win."],
  ["Tips & education", "Teach one useful idea your audience can apply today."],
  ["Engagement post", "Ask a simple question that starts a conversation."],
] as const;

export function ContentIdeas() {
  const [ideas, setIdeas] = useState<Array<readonly [string, string]>>([...IDEAS]);
  return <aside className="rounded-2xl border bg-white p-4 dark:bg-card">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold">Content ideas</h2>
      <button type="button" className="text-xs font-medium text-primary" onClick={() => setIdeas((current) => [...current.slice(1), current[0]])}>
        <RefreshCw className="mr-1 inline h-3.5 w-3.5" />Refresh
      </button>
    </div>
    <div className="space-y-2">{ideas.map(([title, description]) => <div key={title} className="rounded-xl border bg-white p-3 dark:bg-card"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>)}</div>
  </aside>;
}
