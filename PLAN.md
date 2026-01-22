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
│   │       └── page.tsx        # 3D grapher page (includes Calculations panel)
│   ├── components/
│   │   ├── Graph3D.tsx         # Three.js canvas + hover coords + critical point markers
│   │   ├── EquationInput.tsx   # Input with KaTeX preview
│   │   └── RangeControls.tsx   # X/Y axis controls
│   ├── lib/
│   │   ├── mathParser.ts       # Expression parsing, LaTeX conversion, intersection solver
│   │   └── graphing/
│   │       ├── surface3D.ts    # Mesh generation + surface area + volume calc
│   │       └── colors.ts       # Color gradient (6 palettes for multi-function)
│   └── types/
│       └── index.ts            # TypeScript types
├── PLAN.md                     # This file
└── package.json
```

---

## Phase 2: Calculus & Analysis Features [COMPLETED]

### Interactive Analysis
- [x] **Hover coordinates** - Show (x, y, z) tooltip when hovering over surface
- [x] **Global min/max detection** - Find and mark global minimum/maximum with spheres (green=max, red=min)
- [x] **Floating coordinate labels** - Min/max markers show exact coordinates above them
- [x] **Surface area calculation** - Numerical integration using triangle mesh areas
- [x] **Volume calculation** - Volume under surface using trapezoidal rule
- [x] **Calculations panel** - Sidebar panel showing formulas with KaTeX rendering:
  - Global minimum/maximum coordinates
  - Surface area with integral formula
  - Volume under surface with integral formula
- [x] **Grid at z=0** - Grid is now properly positioned at the mathematical z=0 plane

### Future Analysis Features
- [x] **Intersection equation solver** - When 2 functions are plotted, shows the solved intersection equation (y = ...)
  - Universal AST-based solver that recursively isolates y
  - Handles: powers (y^n including y^(2^e)), trig functions, exp/log, sqrt, addition, subtraction, multiplication, division
  - Properly renders LaTeX using mathjs's built-in toTex() for all expressions
  - Expandable "Show working" section with step-by-step derivation
- [x] **Volume between two surfaces** - Calculate and display volume with "Show working"
- [ ] **Intersection curve visualization** - Highlight where multiple surfaces intersect on the 3D graph
- [ ] Vector field visualization (gradients, ∇f)
- [ ] Critical point classification (saddle points, etc.)
- [ ] Contour lines on surface

---

## Phase 3: Polish & SEO [COMPLETED]

### Visual Improvements
- [x] Add axis labels (X, Y, Z text labels)
- [x] Fixed triangle winding for consistent shading
- [x] Arrow heads on axes for direction
- [x] Dynamic grid/axes that scale with range
- [x] Add grid lines on the surface (optional toggle)
- [x] Add "reset view" button to restore default camera position
- [x] Removed zoom limits - can zoom freely in/out
- [x] Auto-reset camera when ranges change
- [x] Mobile touch controls optimization (pinch-to-zoom, touch pan)
- [x] Loading skeleton while Three.js initializes

### SEO & Discoverability
- [x] Add meta descriptions for each page
- [x] Create sitemap.xml
- [x] Add Open Graph tags for social sharing
- [x] Add structured data (JSON-LD)
- [x] Create landing page content explaining the tool
- [x] Add Open Graph images (og:image) - dynamic OG images for all pages

### Quality of Life
- [x] Keyboard shortcuts (Enter to graph instantly, Escape to clear, F for fullscreen)
- [x] Recent equations history (localStorage)
- [x] Download graph as PNG image
- [x] Fullscreen mode toggle (hides sidebar for full graph view)

---

## Phase 4: 2D Grapher [COMPLETED]

### Core Features
- [x] Plot y = f(x) functions
- [x] Multiple functions on same graph (different colors)
- [x] Zoom and pan controls (scroll to zoom, drag to pan)
- [x] Grid with axis labels
- [x] Hover coordinates tooltip
- [x] Download as PNG
- [x] Share URL support
- [x] Recent equations history
- [x] Example equations picker
- [x] **Interest point detection** - zeros, local min/max, intersections with snap-to-hover
- [x] **Smooth curve rendering** - line clipping algorithm for proper edge rendering
- [x] **Discontinuity handling** - tan(x) and other asymptotic functions render correctly
- [x] **Error messages** - invalid expressions show helpful error text
- [ ] Derivative visualization (optional)

### Technical Approach
- Canvas 2D for fast rendering
- Custom evaluator for expressions with implicit multiplication
- Line clipping algorithm for smooth curves at boundaries
- Debounced interest point calculation for smooth zooming
- Similar UI pattern to 3D grapher

---

## Phase 5: Equation Solver [TODO]

### Core Features
- [ ] Solve equations for x (linear, quadratic, cubic)
- [ ] Step-by-step solution display
- [ ] Systems of equations (2 variables)
- [ ] Inequality solver

### Technical Approach
- Use math.js or Nerdamer for symbolic math
- Display steps using KaTeX

---

## Phase 6: Additional Tools [TODO]

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

## Phase 7: Monetization [TODO]

### Google AdSense
- [ ] Apply for AdSense approval (need traffic first)
- [ ] Add ad placements (header, sidebar, footer)
- [ ] Ensure ads don't interfere with tool UX

### Analytics & SEO
- [x] Set up Google Analytics (configurable via NEXT_PUBLIC_GA_MEASUREMENT_ID)
- [x] Google Search Console verified and sitemap submitted
- [x] Pages indexed by Google
- [ ] Track popular equations
- [ ] Monitor user engagement
- [ ] Build backlinks (Reddit, forums, tool directories)
- [ ] Create SEO content pages targeting search terms

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

### 2026-01-22 (Session 5 - 3D Shadows & SEO Setup)
- **Google Search Console setup**:
  - Site verified with HTML file verification
  - Sitemap submitted
  - All pages indexed
- **Shadow system for 3D grapher**:
  - Surface casts shadow onto grid plane below
  - Shadow-receiving ground plane using ShadowMaterial (invisible except for shadows)
  - Cross-surface shadows - surfaces cast shadows on each other
  - Configurable shadow bias to minimize gap between contact and shadow
  - Shadow camera properly configured for coverage
- **Known limitation documented**: Transparent surface sorting is a WebGL limitation
  - When two transparent surfaces intersect, render order depends on camera angle
  - This is inherent to how GPU depth buffers work with transparency
  - Would require Order-Independent Transparency (OIT) to fix properly

### 2026-01-20 (Session 4 - Launch Complete)
- **Google Analytics setup** - Added GoogleAnalytics component (ID: G-XWN89M6HS1)
- **Lint fixes** - Fixed ESLint errors (moved functions outside component, removed redundant useEffects)
- **Build verification** - All pages build successfully with TypeScript checks passing
- **GitHub repo created** - https://github.com/dan-dsilva-wq/mathgraph
- **Vercel deployment** - Live at https://mathgraph.vercel.app
- **Site is now LIVE and tracking analytics**

### 2026-01-20 (Session 3 - Phase 3 Complete)
- **Phase 3: Polish & SEO completed**:
  - **3D Surface Grid Lines** - Optional toggle to show wireframe grid on surfaces
  - **Mobile Touch Controls** - Pinch-to-zoom and touch pan for 2D grapher on mobile devices
  - **Landing Page** - Enhanced with use cases, example equations, feature descriptions, and supported functions
  - **Open Graph Images** - Dynamic OG images generated for homepage, 2D grapher, and 3D grapher
  - **Twitter Card Images** - Matching Twitter cards for social sharing
  - **Keyboard Shortcuts**:
    - `Enter` - Graph instantly (skip debounce)
    - `Escape` - Clear expressions (or exit fullscreen)
    - `F` - Toggle fullscreen mode
  - **Fullscreen Mode** - Hide sidebar to expand graph to full viewport; button + keyboard shortcut

### 2026-01-20 (Session 2)
- **3D Grapher intersection improvements**:
  - **Mini 2D preview** - Shows intersection equation as 2D graph in sidebar
  - **Both ± branches graphed** - When intersection has ±sqrt, shows both positive and negative curves
  - **Open in 2D Grapher link** - Click to open intersection in full 2D grapher with both branches
  - **Collapsible calculations** - Accordion-style UI for Surface Area, Volume, Intersection sections
  - **Dark scrollbars** - Custom styled scrollbars matching dark theme
  - **Taller mini preview** - Increased from h-32 to h-48 for better visibility
- **Expression parsing fixes**:
  - **`e3x` implicit multiplication** - `e3x` → `e*3*x`, `3e` → `3*e`, same for `pi`
  - **Nested parentheses in LaTeX** - Fixed `\sqrt{...}` conversion for expressions with nested braces
  - **`-(sqrt(...))` fix** - Regex now correctly handles nested parentheses without breaking
- **2D Grapher enhancements**:
  - **`+-` input support** - Type `+-sqrt(x)` or `±sqrt(x)` to graph both branches
  - **Proper LaTeX display** - Expression preview now uses `expressionToLatex()` for correct formatting
  - **Axis snapping** - Snaps to y-intercepts (x=0) and x-intercepts (y=0) when hovering near axes
  - **Tiered grid system** - Minor lines (lighter/thinner) and major lines (thicker) with labels
  - **Adaptive grid scaling** - Grid density adjusts based on zoom level (shows 1,2,3... at default zoom)

### 2026-01-20
- **2D Grapher major fixes**:
  - **Smooth curve rendering** - Fixed stepped/blocky graphs with line clipping algorithm
  - **Reset view** - Now properly resets both X and Y axes to initial values
  - **Interest point detection** - Finds zeros, local min/max, and intersections between functions
  - **Snap-to-hover** - Cursor snaps to nearby interest points (30px radius)
  - **Colored markers** - Green=zero, yellow=intersection, red=max, blue=min
  - **tan(x) rendering** - Discontinuity detection prevents vertical lines at asymptotes
  - **Error messages** - Invalid expressions now show helpful error text below input
  - **Zoom performance** - Debounced interest point calculation eliminates lag
- **Expression parsing fixes** (both 2D and 3D):
  - **`exp(-x^2)` fix** - JavaScript syntax error with `-x**2` now handled correctly
  - **`e` constant** - `e*x`, `e(x)`, `ex` now work with implicit multiplication
  - **`pi` constant** - Same implicit multiplication support as `e`
  - Uses negative lookahead to avoid breaking `exp()` function

### 2026-01-19
- **Multi-surface z-scaling fix** - All surfaces now use a global z-range for consistent positioning
  - Previously each surface was scaled independently, causing z=2 and z=3 to appear at the same height
  - Now surfaces are positioned correctly relative to each other and the grid
- **Grid always visible** - Z range now always includes z=0, keeping the reference grid in view
- **Function color consistency** - Colors now match input position even when some inputs are empty
  - Tracks original indices so second function keeps second color even if first input is blank
- **Auto-brackets for trig functions** - `sinx` auto-converts to `sin(x)`, `cosy` to `cos(y)`, etc.
- **Improved intersection equation solver**:
  - Now handles parallel surfaces: shows "No intersection (parallel surfaces)" instead of "-1=0"
  - Better handling of multi-term expressions (separates y-terms from non-y terms)
  - Handles cases where both sides of equation contain y
  - **New quadratic solver** for y² terms using calculus (derivatives to find coefficients)
  - Uses `rationalize()` for full simplification: `(10-2x²)/2` → `5-x²`
  - Evaluates inverse trig at constants: `arcsin(0)` → `0`, `arcsin(1)` → `π/2`
  - Simplifies sqrt of constants: `√4` → `2`
- **Volume button fix** - Button reappears when expressions drop below 2 (was stuck in volume mode)
- **Volume Between Surfaces feature** - Interactive calculation between any two surfaces
  - Click "Calculate Volume" to activate
  - Auto-adds z=0 as second surface if only one exists
  - Editable expressions shown with color indicators
  - "Show working" button shows the integral formula and numerical method details
- **Volume calculation fix** - Fixed midpoint rule to use correct cell count (60×60 not 61×61)
- **Surface area per-expression** - Now shows surface area for each function separately with "Show working"
- **Removed redundant stats overlay** - Analysis panel in top-right removed (info now in sidebar)
- **Cleaner UI** - All calculations consolidated in left sidebar panel

### 2025-01-15
- **Intersection equation solver** - When plotting 2 functions, automatically generates and solves the intersection equation for y
  - Shows simplified result (e.g., `y = ±√(3 - x²)`)
  - Expandable "Show working" button reveals step-by-step derivation
  - **Universal AST-based solver** using mathjs parse tree analysis:
    - Recursively unwraps operations to isolate y
    - Handles any power: `y^(2^e)`, `y^(3^x)`, etc.
    - Handles trig: sin, cos, tan and their inverses
    - Handles exp/log, sqrt
    - Handles addition/subtraction: `y^2 + x^2 = 3` → `y = ±√(3 - x²)`
    - Handles multiplication/division
  - Uses mathjs's built-in `toTex()` for proper LaTeX rendering of all expressions
- **Range input improvements** - Changed from number inputs to text inputs
  - Can now delete entire value and type new number (was blocked before)
  - Updates on blur or Enter key
  - No more ugly number spinner arrows
- **Hidden scrollbars** - Removed white scrollbars from intersection equation display
- Added `@types/react-katex` for TypeScript support

### 2024-01-16 (Update 5)
- **Calculations panel** - Replaced example equations with a calculations sidebar showing:
  - Global minimum coordinates with marker
  - Global maximum coordinates with marker
  - Surface area with formula (using KaTeX): `A = ∬_D √(1 + (∂z/∂x)² + (∂z/∂y)²) dA`
  - Volume under surface with formula: `V = ∬_D |z(x,y)| dA`
- **Volume calculation** - Added numerical integration for volume under surface
- **Floating labels** - Min/max markers now display coordinates above them
- **Grid positioned at z=0** - Grid helper now correctly positioned at mathematical z=0 plane
- **Simplified critical points** - Changed from all local extrema to just global min/max (more useful)
- Added `react-katex` dependency for formula rendering

### 2024-01-15 (Update 4)
- **Hover coordinates** - Hover over surface to see (x, y, z) coordinates in tooltip
- **Min/max detection** - Automatically finds and marks critical points with spheres
  - Green spheres for local maxima
  - Red spheres for local minima
- **Surface area calculation** - Computes and displays total surface area
- **Analysis panel** - New stats panel in top-right showing surface area and critical points
- **Arrow heads on axes** - Visual direction indicators on X, Y, Z axes
- **Dynamic grid/axes** - Grid and axes now scale with range changes

### 2024-01-15 (Update 3)
- **Axis labels** - X, Y, Z labels at end of each axis (color-coded)
- **Fixed shading bug** - consistent triangle winding fixes lighting on paraboloid/symmetric surfaces

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
