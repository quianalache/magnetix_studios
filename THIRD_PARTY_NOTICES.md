# Third-Party Notices

This file lists third-party source material adapted into Magnetix's own
code, as required by the license terms of that material. It does not cover
npm dependencies (see `package.json`/`pnpm-lock.yaml` for those) — only
data/code ported or adapted directly into this repo's own source files.

---

## schokee/Astrolo — Human Design BodyGraph geometry

**Source:** https://github.com/schokee/Astrolo
**License:** MIT
**Copyright:** (c) 2023 Antony Titsas

```
MIT License

Copyright (c) 2023 Antony Titsas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**What was adapted (2026-08-17):** the real vector geometry for the Human
Design BodyGraph — all 9 center shapes, all 64 gate positions, and all 64
per-gate channel-stub paths (including the hand-fitted cubic-Bézier curves
for the 10/20/34/57 "Community square" junction cluster) — from Astrolo's
`source/Astrolo.Presentation.Controls/Themes/BodyGraph.xaml`. WPF's
abbreviated `PathGeometry` syntax was translated directly to SVG path `d`
syntax (the two are the same M/L/H/V/C/Z grammar). Lives in
`src/lib/energetics/human-design-chart-layout.ts`.

**What was NOT used:** Astrolo's body-silhouette artwork, its color
palette/branding, its WPF control chrome, or any of its calculation/data
model code — only the functional center/gate/channel coordinate geometry.
Magnetix's own chart rendering (color logic, Chart Design customization,
Personality/Design/dual-activation styling), calculations, and every other
Energetic Decoder feature are original Magnetix code, unrelated to Astrolo.

---

## adamblvck/free-human-design — Human Design gate/center/channel reference data

**Source:** https://github.com/adamblvck/free-human-design
**License:** MIT
**Copyright:** (c) 2026 Adam Blvck / Blvck Studios

**What was adapted:** the gate-to-center mapping and the 36 channel
(gate-pair) definitions — well-known, public-domain Human Design system
data, cross-checked against this project's own independently-built gate
wheel ordering — in `src/lib/energetics/human-design-data.ts`. Also the
original source (since replaced, see above) for this app's very first
bodygraph layout coordinates.
