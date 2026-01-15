# MathGraph Development Plan

## Project Overview
A modern, fast online math tools platform targeting students. Starting with 3D graphing, expanding to 2D graphing, equation solvers, and more.

**URL:** https://mathgraph.vercel.app
**Target Audience:** High school and university students
**Monetization:** Ad-supported (free for users)
**Stack:** Next.js 14 + TypeScript + Tailwind + Three.js + math.js + KaTeX + Vercel

---

## Competitive Advantage

| Competitor | Weakness | Our Advantage |
|------------|----------|---------------|
| GeoGebra 3D | Clunky UI, feels dated, slow | Modern, fast, mobile-friendly |
| Wolfram Alpha | Expensive ($5/mo for full features) | Free, focused, simple |
| Desmos | No 3D support | 3D-first approach |
| Random online graphers | Terrible UX, broken, ad-infested | Clean, works properly |

---

## Phase 1: 3D Grapher MVP [COMPLETED]

### Core Features
- [x] Three.js 3D surface rendering
- [x] math.js expression parsing (x^2, sin, cos, exp, sqrt, etc.)
- [x] KaTeX live equation preview
- [x] OrbitControls (drag to rotate, scroll to zoom)
- [x] Color gradient based on z-values
- [x] Auto-scaling z-axis (fits proportionally to x/y range)
- [x] Wireframe overlay for better shape visibility
- [x] X/Y range controls
- [x] Example equations picker
- [x] Shareable URLs (encodes expressions + ranges)
- [x] Dark theme with modern UI
- [x] Side panel layout (controls always visible)
- [x] Responsive design
- [x] Production deployment
- [x] **Multi-function support** (up to 6 functions)
- [x] Distinct color palettes per function (blue, orange, green, purple, cyan, red)
- [x] Transparent surfaces for viewing intersections
- [x] Add/remove function UI with color indicators

### File Structure
```
mathgraph/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout + KaTeX CSS
│   │   ├── page.tsx            # Home page
│   │   └── 3d-grapher/
│   │       └── page.tsx        # 3D grapher page
│   ├── components/
│   │   ├── Graph3D.tsx         # Three.js canvas
│   │   ├── EquationInput.tsx   # Input with KaTeX preview
│   │   ├── RangeControls.tsx   # X/Y axis controls
│   │   ├── ExamplePicker.tsx   # Preset equations
│   │   └── ShareButton.tsx     # Copy shareable link
│   ├── lib/
│   │   ├── mathParser.ts       # Expression parsing
│   │   └── graphing/
│   │       ├── surface3D.ts    # Mesh generation
│   │       └── colors.ts       # Color gradient
│   └── types/
│       └── index.ts            # TypeScript types
├── PLAN.md                     # This file
└── package.json
```

---

## Phase 2: Polish & SEO [TODO]

### Visual Improvements
- [ ] Add axis labels (X, Y, Z text labels)
- [ ] Add grid lines on the surface (optional toggle)
- [x] Add "reset view" button to restore default camera position
- [x] Removed zoom limits - can zoom freely in/out
- [x] Auto-reset camera when ranges change
- [ ] Mobile touch controls optimization
- [ ] Loading skeleton while Three.js initializes

### SEO & Discoverability
- [ ] Add meta descriptions for each page
- [ ] Create sitemap.xml
- [ ] Add Open Graph images for social sharing
- [ ] Add structured data (JSON-LD)
- [ ] Create landing page content explaining the tool

### Quality of Life
- [ ] Keyboard shortcuts (Enter to graph, Escape to clear)
- [ ] Recent equations history (localStorage)
- [ ] Download graph as PNG image
- [ ] Fullscreen mode toggle

---

## Phase 3: 2D Grapher [TODO]

### Core Features
- [ ] Plot y = f(x) functions
- [ ] Multiple functions on same graph (different colors)
- [ ] Zoom and pan controls
- [ ] Grid with axis labels
- [ ] Intersection point detection
- [ ] Derivative visualization (optional)

### Technical Approach
- Use Canvas 2D or a lightweight charting library
- Reuse math.js parser
- Similar UI pattern to 3D grapher

---

## Phase 4: Equation Solver [TODO]

### Core Features
- [ ] Solve equations for x (linear, quadratic, cubic)
- [ ] Step-by-step solution display
- [ ] Systems of equations (2 variables)
- [ ] Inequality solver

### Technical Approach
- Use math.js or Nerdamer for symbolic math
- Display steps using KaTeX

---

## Phase 5: Additional Tools [TODO]

### Matrix Calculator
- [ ] Matrix input UI
- [ ] Operations: add, multiply, transpose
- [ ] Determinant calculation
- [ ] Inverse matrix
- [ ] Eigenvalues/eigenvectors

### Calculus Tools
- [ ] Derivative calculator with steps
- [ ] Integral calculator with steps
- [ ] Limit calculator
- [ ] Series expansion

### Statistics
- [ ] Mean, median, mode calculator
- [ ] Standard deviation
- [ ] Linear regression
- [ ] Probability distributions

---

## Phase 6: Monetization [TODO]

### Google AdSense
- [ ] Apply for AdSense approval (need traffic first)
- [ ] Add ad placements (header, sidebar, footer)
- [ ] Ensure ads don't interfere with tool UX

### Analytics
- [ ] Set up Google Analytics or Plausible
- [ ] Track popular equations
- [ ] Monitor user engagement

---

## Technical Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| 3D Library | Three.js | Most flexible, great performance |
| Math Parsing | math.js | Handles complex expressions well |
| Math Rendering | KaTeX | Faster than MathJax |
| Framework | Next.js 14 | SSR for SEO, easy Vercel deploy |
| Styling | Tailwind | Fast development, consistent design |
| Hosting | Vercel | Free tier, great DX |

---

## Changelog

### 2024-01-15 (Update 2)
- **Unlimited zoom** - removed zoom limits so users can zoom out/in freely
- **Reset View button** - quickly restore default camera position
- **Auto-reset on range change** - camera automatically adjusts when x/y ranges change
- Increased camera far plane to 100000 for very large ranges

### 2024-01-15
- **Multi-function graphing** - plot up to 6 functions simultaneously
- Each function has a distinct color palette with hue shifting for depth
- Surfaces are semi-transparent when multiple functions displayed
- Add/remove functions with color-coded indicators
- Share URLs support multiple functions (separated by |)
- **Auto-update** - graph updates as you type (300ms debounce)
- **Implicit multiplication** - `2x`, `xy`, `x3`, `2sin(x)` all work now
- Improved color gradients with hue variation for better depth perception
- Home page updated to match dark theme
- Git version control set up for code backups

### 2024-01-14
- Initial release of 3D Grapher
- Dark theme UI overhaul
- Fixed z-axis scaling (auto-fits to viewport)
- Added wireframe overlay
- Side panel layout (no scroll needed)
- Deployed to mathgraph.vercel.app
