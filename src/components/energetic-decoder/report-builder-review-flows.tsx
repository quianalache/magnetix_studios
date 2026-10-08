"use client";

import { useState } from "react";

export function ReportBuilderReviewFlows() {
  const [warning, setWarning] = useState<"preview" | "generate" | null>(null);
  const [continued, setContinued] = useState(false);
  const [visibility, setVisibility] = useState<"matching" | "non-matching">("matching");
  return (
    <section className="mx-auto mb-4 grid w-full max-w-[1400px] gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm lg:grid-cols-[1fr_1fr_1fr]">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Fixture Content Set</p><p className="mt-1 text-sm font-semibold">Owner Review — Blank Frequency</p><p className="text-xs text-muted-foreground">Default and custom-set resolution are safe, local-only fixtures.</p></div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setWarning("preview"); setContinued(false); }} className="rounded-lg bg-[#5420a8] px-3 py-2 text-xs font-semibold text-white">Preview PDF</button><button type="button" onClick={() => { setWarning("generate"); setContinued(false); }} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-800">Generate Report</button><span className="text-xs text-muted-foreground">Missing content is never a hard block.</span></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Page visibility fixture</p><div className="mt-1 flex gap-2"><button type="button" onClick={() => setVisibility("matching")} className={`rounded-lg border px-2 py-1 text-xs ${visibility === "matching" ? "bg-violet-100" : ""}`}>Type = Generator</button><button type="button" onClick={() => setVisibility("non-matching")} className={`rounded-lg border px-2 py-1 text-xs ${visibility === "non-matching" ? "bg-violet-100" : ""}`}>Type = Projector</button></div><p className="mt-1 text-xs text-muted-foreground">{visibility === "matching" ? "Generator-only page visible in fixture preview." : "Generator-only page hidden; page numbering collapses."}</p></div>
      {warning && !continued && <div className="lg:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-950">Missing content before {warning === "preview" ? "Preview PDF" : "Generate Report"}</p><p className="mt-1 text-amber-900">Owner Review — Blank Frequency has no interpretation for Frequency gate 1 giftText.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setWarning(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold">Go back / review content</button><button type="button" onClick={() => setContinued(true)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white">Continue anyway</button></div></div>}
      {warning && continued && <div className="lg:col-span-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">{warning === "preview" ? "Preview rendered" : "Report generated from fixture"}</p><p className="mt-1">The report continues with the Frequency interpretation blank, exactly as authored. No fallback text was inserted.</p></div>}
    </section>
  );
}
