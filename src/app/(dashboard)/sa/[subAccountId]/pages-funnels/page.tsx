"use client";

import { Suspense } from "react";
import { PageShellLoading } from "@/components/system/page-shell";
import { PagesFunnelsHome } from "@/components/pages-funnels/home/pages-funnels-home";

/** Pages & Funnels home — Pages and Funnels views with one Create menu (see PagesFunnelsHome). */
export default function PagesFunnelsPage() {
  return (
    <Suspense fallback={<PageShellLoading width="wide" />}>
      <PagesFunnelsHome />
    </Suspense>
  );
}
