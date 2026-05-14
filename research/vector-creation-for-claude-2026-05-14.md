# Vector Creation for Claude: Practical Guide

**Date:** 2026-05-14
**For:** Travis, deciding how to invest in Claude's vector-graphics capability ahead of `travisEATSbugs` and downstream brand work (Pivotal, Lions Share, Theoria, travisFIXES, travisMAKES).
**TL note:** Travis prefers no TL;DRs. See "Travis's decision points" at the end for the choices that need making.

---

## 1. Why LLMs are bad at SVG generation natively

SVG generation hits two structural weaknesses of token-prediction models simultaneously:

- **Numerical / spatial reasoning at character resolution.** A path like `M125.3,84.7 C140.2,72.1 158.6,68.4...` is a chain of coordinates where one digit error breaks the shape. LLMs are weak at precise numerical sequences and have no visual grounding when emitting them. A small `x`/`y` slip silently misplaces an element.
- **No rendered-image feedback during emission.** Standard autoregressive models never see what their SVG looks like as they write it. They emit tokens, the result renders elsewhere, the model never closes the loop. ([Rendering-Aware Reinforcement Learning, arXiv 2505.20793](https://arxiv.org/abs/2505.20793))

A third issue is structural: SVG is hierarchical (defs, groups, paths, transforms) but tokenizers treat it as flat character sequences. Hallucinations in primitive predictions are common. ([Empowering LLMs to Understand and Generate Complex Vector Graphics, CVPR 2025](https://arxiv.org/html/2412.11102v3))

**State of the art, 2025-2026.** The field has converged on three approaches:

- **Specialized SVG-token models.** LLM4SVG and OmniSVG parameterize SVG commands as discrete tokens and train VLMs end-to-end. OmniSVG is built on Qwen-VL with an SVG tokenizer, NeurIPS 2025. ([OmniSVG GitHub](https://github.com/OmniSVG/OmniSVG))
- **LLM + diffusion hybrid.** Chat2SVG (CVPR 2025): LLM emits a primitive template, image diffusion (SDEdit + ControlNet) enhances it, dual-stage optimization refines the result. ([Chat2SVG project](https://chat2svg.github.io/))
- **Render-feedback reinforcement learning.** RLRF (May 2025): render the SVG, compare to target image, reward visual fidelity. Smaller models outperform GPT-4o and Gemini 1.5 Pro on Im2SVG tasks. ([RLRF paper](https://arxiv.org/abs/2505.20793))

**[VERIFY]** Whether Anthropic has done internal SVG-specific RL on Opus/Sonnet 4.x is not publicly documented. The CVPR/NeurIPS work above is research; production Claude is what Travis hits when he asks for a logo, and it does not have these specialized capabilities. The gap is real.

---

## 2. The visual-feedback-loop pattern

This is the highest-leverage pattern available right now and the one Travis can adopt today without waiting for new models. Anthropic's own Claude Code best practices say "including tests, screenshots, or expected outputs so Claude can check itself is the single highest-leverage thing you can do." ([Claude Code best practices](https://code.claude.com/docs/en/best-practices))

**Canonical loop:**

1. Claude writes SVG to a file.
2. A shell command rasterizes it to PNG (resvg, rsvg-convert, headless Chrome, or Inkscape CLI).
3. Claude reads the PNG with the Read tool (multimodal vision).
4. Claude critiques: "the bug is offset, the mouth is asymmetric, the proportions are wrong."
5. Claude edits the SVG. Repeat.

**Working implementations:**

- **neonwatty/logo-designer-skill** (Claude Code plugin, MIT, v1.0.0 May 4 2026). Five-phase workflow: interview, explore (3-5 parallel SVG concepts via Task subagents), refine, export PNGs at 7 standard sizes (16-2048 px). Auto-detects renderer: prefers `@aspect-build/resvg`, falls back to Inkscape, then librsvg. Enforces SVG conventions: `viewBox` only no fixed width/height, no external fonts, system font fallbacks, logical `<g>` groupings with stable IDs, solid fills preferred over thin strokes (stroke-width 6+ minimum for outlines), explicit small-size legibility checks at 16/32/64 px. ([Repo](https://github.com/neonwatty/logo-designer-skill), [Jeremy Watt writeup](https://neonwatty.com/posts/logo-designer-skill-claude-code/))
- **rknall/claude-skills `svg-logo-designer`** (Oct 2025, 46 stars, MIT). Adjacent design: multiple concepts, layout variations (horizontal/vertical/square/icon-only), color variations (full/mono/reversed), six logo types. Less of a rendering harness; more of a structured prompt. ([README](https://github.com/rknall/claude-skills/blob/main/svg-logo-designer/README.md))
- **claude-code-frontend-dev** (Nov 2025, MIT, 29 stars). Generic visual-feedback loop for any web UI, not SVG-specific. Playwright/Puppeteer takes screenshots at multiple viewports, Claude 4.5 Sonnet analyzes them, auto-iterates up to 5 cycles. Web-focused but the architecture generalizes. ([Repo](https://github.com/hemangjoshi37a/claude-code-frontend-dev))

**Cost/latency.** PNG rasterization is local and effectively free (resvg-js renders in tens of ms). The bottleneck is the vision pass: each iteration costs one image read (small) plus the SVG edit (variable). Five iterations on a logo is realistic in under a minute of model time. The Bleep That Sh*t example in the neonwatty repo shows 5 initial concepts and 37 iterations across 10 design phases in ~10 minutes of wall time.

**Pitfalls:**

- **Hallucinated coordinates.** Even with feedback, Claude tends to over-correct in jumps that overshoot. The neonwatty skill works around this by treating each iteration as full regeneration of the affected group, not edit-in-place of individual numbers.
- **Tool-installation drift.** resvg-js (npm) needs no system dependencies. rsvg-convert (librsvg) needs Homebrew. Inkscape CLI is the heaviest. Auto-detect with fallback is the right pattern.
- **Vision-pass framing.** Claude's vision works best when the rendered PNG is displayed at the size it will actually be used. The favicon-strip pattern (render at 64/32/16 simultaneously) catches "detail vanishes at small size" early.

---

## 3. MCP servers for vector work

| Server | Maturity | What it does | Notes |
|---|---|---|---|
| [Shriinivas/inkmcp](https://github.com/Shriinivas/inkmcp) | Early (40 stars, Linux-only) | Live D-Bus control of Inkscape: create elements, run Python/inkex, get document/selection info, capture screenshots, hybrid execution | Real Inkscape control but Linux-only is a hard blocker on macOS |
| [sandraschi/inkscape-mcp](https://github.com/sandraschi/inkscape-mcp) | Newer FastMCP 3.1 server | Inkscape control via CLI, includes webapp | [VERIFY] Cross-platform claim not confirmed |
| [GenWaveLLC/svgmaker-mcp](https://github.com/GenWaveLLC/svgmaker-mcp) | Active | Wraps SVGMaker API (paid service) for text-to-SVG, image-to-SVG, natural-language edits | API-key dependent, not local |
| `cli-anything-inkscape` skill | Skill (not MCP) | Inkscape CLI harness for Claude Code with stateful undo/redo | Useful if Inkscape is installed |
| `vectosolve` MCP | Vendor-promoted | AI vectorization, BG removal, upscaling, logo generation | Vendor-published benchmarks rank themselves #1, treat skeptically |
| `replicate-flux-mcp` | Active | Calls Replicate Flux via MCP for image generation; tangential to SVG | Not vector-native |

**Bottom line on MCPs.** There is no clear winner here yet. The Blender MCP analog Travis is hoping for does not exist for SVG. The closest thing is a Claude Code skill (the neonwatty one) plus local CLI tools, not a true MCP. **[VERIFY]** I did not test these end-to-end; the assessments are from documentation and stars.

---

## 4. Raster-to-vector pipelines

When the right move is "let an image model draw it, then trace":

| Tool | Type | API | Local? | Output quality | Notes |
|---|---|---|---|---|---|
| [vtracer](https://github.com/visioncortex/vtracer) | OSS Rust | `cargo install vtracer`, also npm/pip | Yes | Compact, stacked layers, no holes; can produce seams in cutout mode | 6k stars, last release 0.6.4 April 2024. Linear-time (O(n)), handles color, works on photos. Hierarchical stacking strategy is good for logo-like inputs. |
| [potrace](https://en.wikipedia.org/wiki/Comparison_of_raster-to-vector_conversion_software) | OSS C | CLI | Yes | B&W only, smooth curves | Older, only takes binarized input |
| [Recraft Vectorize](https://replicate.com/recraft-ai/recraft-vectorize) | Hosted | Yes (Recraft API, also on Replicate/fal/Segmind) | No | Clean paths, professional-grade per their docs and 3rd-party tests | Recraft V3 Vector pricing: $0.08 per vector generation, $0.04 per raster |
| [Vectorizer.AI](https://vectorizer.ai/api) | Hosted | Yes (credit-based) | No | Sub-pixel precision, symmetry detection, multiple curve types (cubic, circular, elliptical, quadratic arcs) | $9.99 to $4999/mo by credit tier; rollover up to 5x monthly. Best for photographic and high-precision tracing. |
| [SVGMaker](https://svgmaker.io/) | Hosted | Yes (and MCP) | No | Logo and icon generation, natural-language edits | API + MCP combo is the easiest Claude Code integration of the hosted options |
| StarVector | OSS model | Self-host | Possible on Mac with caveats | Specialized for icons, logotypes, technical diagrams, graphs/charts; **explicitly NOT for natural images or illustrations** | Apache 2.0. 1B and 8B variants on HuggingFace. Training needed 8 GPUs; inference smaller but GPU/CUDA recommended. Apple Silicon support unclear. ([Repo](https://github.com/joanrod/star-vector)) |
| OmniSVG | OSS model | Self-host | Possible | Most ambitious: icons to anime characters; requires Cairo, Python 3.10, GPU | NeurIPS 2025. ([Repo](https://github.com/OmniSVG/OmniSVG)) |

**Cleanest editable SVG output for logos:** Recraft V3 Vector (paid, $0.08/gen, API on Replicate) and vtracer (free, local, Rust) are the two practical winners. Vectorizer.AI is technically excellent but oriented to photographs and overkill for logo work. Flag: the "8 AI SVG Generators Tested in 2026" comparison ranks the publishing vendor #1, so treat it as marketing data with useful methodology, not as independent benchmarks.

**SVGO post-processing.** Whatever pipeline produces the SVG, run [SVGO](https://github.com/svg/svgo) to clean it: round path data, collapse useless groups, merge paths, strip editor metadata. Reductions of 30-70% in file size are typical, and for interactive SVGs you'll want to disable `cleanupIds` and `inlineStyles` overrides.

---

## 5. Programmatic SVG primitives

When the right move is "code the vector parametrically." This route shines for logos with symmetry, alignment to a grid, or families of related variants.

| Library | Strength | Best for |
|---|---|---|
| [D3.js](https://d3js.org/) | Data-driven SVG generation, mature ecosystem | Logos derived from data, generative branding |
| [Paper.js](http://paperjs.org/) | "Swiss Army knife" of vector scripting; first-class bezier math, path-fitting, boolean ops | Complex curve work, programmatic stylization |
| [Two.js](https://two.js.org/) | Renderer-agnostic (SVG, canvas, WebGL), simple scenegraph | Quick parametric icons and animations |
| SVG.js | Direct SVG manipulation | Editing existing SVG, lightweight DOM-style work |
| p5.js (SVG mode) | Creative-coding ergonomics | Sketching ideas fast, less precise output |

**When parametric beats free-form path drawing.** Symmetry, grid alignment, golden-ratio or other geometric constraints. For a travisEATSbugs mark that needs a clean radial composition or a repeating motif, parametric beats any LLM-emitted path data because the constraints are first-class. The trade-off is one-off uniqueness: parametric output looks parametric.

---

## 6. Iterative refinement workflows that work TODAY in Claude Code

Concrete pattern, ready to wrap in a slash command:

**Setup (one time)**
```
npm i -D @resvg/resvg-js svgo
```

**Loop (per logo iteration)**
1. Claude writes `logos/concepts/v1.svg`.
2. Bash: `node -e "const fs=require('fs');const{Resvg}=require('@resvg/resvg-js');const svg=fs.readFileSync('logos/concepts/v1.svg');const r=new Resvg(svg,{fitTo:{mode:'width',value:512}});fs.writeFileSync('logos/concepts/v1.png',r.render().asPng())"`
3. Optionally render a favicon strip: same script at widths 16, 32, 64, 256, 512 side-by-side via canvas or composed via ImageMagick.
4. Claude uses the Read tool on `v1.png` (multimodal).
5. Claude writes a self-critique to the thread file: which features render, which break, what to fix.
6. Claude edits `v1.svg`. Loop.

**Why this works today:**
- Claude's Read tool is multimodal and reads PNG directly.
- `@resvg/resvg-js` is zero-dependency, ships prebuilt binaries for Apple Silicon, renders fast.
- No external API, no rate limit, no cost beyond the model's own image-read tokens.

**Pitfalls:**
- **Resvg does not run JavaScript.** Animated or scripted SVGs render at frame 0 only. For static logos this is fine; for an animated brand mark, use Playwright/Chromium instead.
- **Fonts.** If the SVG references a system font not present in resvg's font search path, text renders wrong. Either inline-convert text to paths during generation, or use the `font` option in resvg to point at specific font files.
- **Color profiles.** sRGB only; CMYK SVGs are off the table for this pipeline.

**Wrapping as a Claude Code skill.** The neonwatty repo is the reference implementation. Either fork it or write a thinner version specific to travisEATSbugs. The skill encodes: phase boundaries (interview / explore / refine / export), parallel concept dispatch via Task subagents, the favicon-strip preview, and the SVG-quality conventions list. Total code is small.

---

## 7. The brand-system angle

Once a logo is a clean SVG, the next gap is consistency across an icon family, color tokens, and themeable variants.

| Tool | Role | Notes |
|---|---|---|
| [Iconify](https://iconify.design/) | Universal icon framework, 275,000+ icons across 150+ sets | Single React/Vue/etc API instead of per-set installs; works great as a baseline icon library a brand mark sits on top of |
| [Lucide](https://github.com/lucide-icons/lucide) | 800+ consistent stroke icons, Feather fork | Cleanest pure stroke style if Travis wants that aesthetic; explicitly doesn't accept brand logos |
| [Tabler Icons](https://tabler.io/icons) | 5,900+ icons on a 24x24 grid | Most exhaustive consistent set |
| [Penpot](https://penpot.app/) + [Iconify plugin](https://iconify.design/docs/design/penpot/) | OSS Figma alternative | If Travis wants a design tool, Penpot is free, OSS, runs locally, has an Iconify plugin built in |
| [Figma MCP](https://claude.com/plugins/figma) | Claude plugin | If he's already on Figma, the MCP exposes `get_variable_defs` for design tokens, can read components, and can write design tokens to a file Claude consumes |
| [Lottielab](https://www.lottielab.com/) | SVG to Lottie animation | 2025 milestone: Lottie now has an official IANA MIME type (`video/lottie+json`). If logo motion is on the roadmap, this is the production format. |

**Operationalizing "one logo to full icon system."** Treat the logo as the primitive. Define color tokens (CSS custom properties or a `tokens.json`). Build the icon set on the same stroke/fill rules as the logo (stroke-width, corner radius, terminal style). Iconify or Tabler is the fallback when a niche icon is needed; the custom marks are the ones that carry brand. Penpot or Figma is where this lives if Travis wants a design surface; if he doesn't, a `brand/` directory with SVGs and a tokens file in the repo is enough.

---

## 8. travisEATSbugs-specific recommendation

The icon is a stylized mouth eating a bug. That's stylized illustration with two recognizable elements that need to read together at small sizes. Ranked by quality-of-output times ease-of-integration:

**#1: Recraft V3 Vector via API + local visual-feedback refinement loop**
- Generate 4-8 initial concepts via Recraft V3 SVG ([Replicate endpoint](https://replicate.com/recraft-ai/recraft-v3-svg), $0.08 per generation).
- Pull the best 2-3 SVGs into the repo.
- Run them through the neonwatty-style visual-feedback loop (resvg-js render to Claude vision read to critique to revise) to tighten the proportions and clean small-size legibility.
- SVGO pass to optimize.
- **Why:** Recraft is the consensus best text-to-SVG generator across 2026 benchmarks. Output is reportedly clean and editable (not 12k-node spaghetti). $0.40-0.80 of API spend gets you 5-10 concepts. The local refinement loop fixes the parts Claude can fix and bails to "regenerate with adjusted prompt" if a concept is fundamentally off.

**#2: Pure local pipeline (no paid API)**
- Use the [neonwatty/logo-designer-skill](https://github.com/neonwatty/logo-designer-skill) directly.
- Phase 1-3 produces SVGs entirely from Claude with the visual-feedback loop.
- Phase 4 exports PNGs at 16-2048 px.
- **Why:** Free, repeatable, fully in the Claude Code workflow Travis already uses. The output will be less polished than Recraft for stylized illustration specifically, but for an open-source widget where the logo will keep evolving, having a tight loop matters more than first-pass quality.

**#3: Gemini/DALL-E raster to vtracer to SVGO to refine**
- Generate a raster mascot in Gemini or DALL-E 3 (the path Travis already used).
- Run it through `vtracer --colormode color --mode spline --hierarchical stacked` for clean layered output.
- SVGO to clean.
- Hand-edit or use Claude in feedback loop for final tightening.
- **Why:** If Travis already has a Gemini-generated raster he likes (the current TRAVIS EATS BUGS lockup), this preserves that work and converts it to editable vectors. vtracer is local, free, and produces clean compact output for logo-like inputs. The risk is that traced output rarely has the structural cleanliness of a born-vector logo: groups don't carry semantic meaning, paths can have hundreds of nodes, and edits require manual cleanup.

**The pragmatic call:** Start with #1 for the cost of a coffee, then move to #2 once a direction is locked. Skip #3 unless he loves the Gemini raster and just wants to vectorize it.

---

## Travis's decision points

1. **Pay for a generation API or stay fully local?** $0.08/gen on Recraft V3 buys quality-of-output that local LLM SVG emission can't currently match. If travisEATSbugs will spawn 50+ vector assets across logo, icon set, marketing, playground, paying once unblocks the rest.

2. **Adopt the neonwatty/logo-designer-skill or fork it?** It's MIT and the structure is exactly what's needed. Forking gets you control of the SVG conventions, phase prompts, and the favicon-strip preview customized to your brand standards. Forking is the right call if multiple Travis brands will use this (Pivotal, Lions Share, Theoria, travisFIXES, travisMAKES all need vector work).

3. **resvg-js vs Inkscape CLI vs headless Chrome for the rendering side?** resvg-js is the cleanest for static logos. Headless Chrome is the right choice if SVG animations or web fonts enter the picture. Inkscape CLI is the heaviest install and rarely needed unless you want path-boolean operations.

4. **One brand system or per-product?** Once travisEATSbugs has a real logo, do you stamp it through Lions Share, Pivotal client work, and personal sites with shared color tokens and an icon family? Or does each product get its own visual canon? This decides whether Penpot/Figma enters the stack or whether `brand/` directories with shared tokens is enough.

5. **MCP or skill?** The MCP-for-SVG ecosystem isn't mature (the closest analog to Blender MCP doesn't exist). The Claude Code skill pattern is mature and matches what Travis already uses. Default to skill; revisit MCP in 6-12 months when one of inkmcp/svgmaker-mcp/sandraschi reaches battle-tested state.

---

## Sources

**Research papers:**
- [Empowering LLMs to Understand and Generate Complex Vector Graphics (CVPR 2025)](https://arxiv.org/html/2412.11102v3)
- [Chat2SVG: Vector Graphics Generation with LLMs and Image Diffusion Models (CVPR 2025)](https://chat2svg.github.io/)
- [Rendering-Aware Reinforcement Learning for Vector Graphics Generation (May 2025)](https://arxiv.org/abs/2505.20793)
- [OmniSVG: A Unified Scalable Vector Graphics Generation Model (NeurIPS 2025)](https://github.com/OmniSVG/OmniSVG)
- [StarVector (CVPR 2025)](https://github.com/joanrod/star-vector)
- [SVGenius benchmark](https://arxiv.org/html/2506.03139v1)
- [SVGDreamer (CVPR 2024)](https://github.com/ximinng/SVGDreamer)

**Tools and skills:**
- [neonwatty/logo-designer-skill](https://github.com/neonwatty/logo-designer-skill) + [Jeremy Watt's writeup](https://neonwatty.com/posts/logo-designer-skill-claude-code/)
- [rknall/claude-skills svg-logo-designer](https://github.com/rknall/claude-skills)
- [claude-code-frontend-dev](https://github.com/hemangjoshi37a/claude-code-frontend-dev)
- [Shriinivas/inkmcp](https://github.com/Shriinivas/inkmcp)
- [SVGMaker MCP](https://github.com/GenWaveLLC/svgmaker-mcp)
- [vtracer](https://github.com/visioncortex/vtracer)
- [Recraft V3 SVG on Replicate](https://replicate.com/recraft-ai/recraft-v3-svg)
- [Vectorizer.AI pricing](https://vectorizer.ai/pricing)
- [resvg-js](https://www.npmjs.com/package/@resvg/resvg-js)
- [SVGO](https://github.com/svg/svgo)
- [Paper.js](http://paperjs.org/), [Two.js](https://two.js.org/), [D3](https://d3js.org/)
- [Iconify](https://iconify.design/), [Lucide](https://github.com/lucide-icons/lucide), [Tabler Icons](https://tabler.io/icons)
- [Penpot + Iconify](https://iconify.design/docs/design/penpot/)
- [Figma MCP](https://claude.com/plugins/figma)
- [Lottielab](https://www.lottielab.com/)

**Comparisons and benchmarks:**
- [8 AI SVG Generators Tested in 2026](https://vectosolve.com/blog/best-ai-svg-generators-text-to-vector-2026) (vendor-published, treat skeptically)
- [Anthropic Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- [Anthropic Vision docs](https://docs.anthropic.com/en/docs/build-with-claude/vision)

---

## Most surprising finding

A close-to-production Claude Code skill for iterative SVG logo design already exists ([neonwatty/logo-designer-skill](https://github.com/neonwatty/logo-designer-skill), v1.0.0 May 4 2026), and it independently arrived at the exact pattern Travis intuited: parallel concept generation via subagents, visual-feedback loop via resvg-js, favicon-strip preview to catch small-size legibility failures. The path Travis was about to invent is already paved. Fork it.
