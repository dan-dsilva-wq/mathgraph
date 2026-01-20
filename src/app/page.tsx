import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950">
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            MathGraph
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-4">
            Free online graphing calculator for students
          </p>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto">
            Plot 2D and 3D functions instantly. No downloads, no sign-ups, no fees.
            Just type your equation and see it visualized in real-time.
          </p>
          <div className="flex justify-center gap-4 mt-8">
            <Link
              href="/3d-grapher"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            >
              Try 3D Grapher
            </Link>
            <Link
              href="/2d-grapher"
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg border border-slate-700 transition-colors"
            >
              Try 2D Grapher
            </Link>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-16">
          {/* 3D Grapher */}
          <Link
            href="/3d-grapher"
            className="group bg-slate-900 p-6 rounded-xl border border-slate-800 hover:border-blue-500 transition-all hover:bg-slate-800/50"
          >
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-colors">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              3D Surface Grapher
            </h2>
            <p className="text-slate-400 text-sm mb-3">
              Visualize multivariable functions in 3D. Perfect for calculus III and linear algebra.
            </p>
            <ul className="text-slate-500 text-xs mb-4 space-y-1">
              <li>Plot up to 6 surfaces simultaneously</li>
              <li>Auto-detects min/max points</li>
              <li>Calculates surface area and volume</li>
              <li>Finds intersection curves</li>
            </ul>
            <span className="text-blue-400 text-sm font-medium group-hover:text-blue-300 flex items-center gap-1">
              Open Tool
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* 2D Grapher */}
          <Link
            href="/2d-grapher"
            className="group bg-slate-900 p-6 rounded-xl border border-slate-800 hover:border-green-500 transition-all hover:bg-slate-800/50"
          >
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition-colors">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              2D Function Grapher
            </h2>
            <p className="text-slate-400 text-sm mb-3">
              Plot any y = f(x) function instantly. Great for algebra, precalc, and calculus.
            </p>
            <ul className="text-slate-500 text-xs mb-4 space-y-1">
              <li>Multiple functions with different colors</li>
              <li>Auto-finds zeros and intersections</li>
              <li>Snap-to-point hovering</li>
              <li>Works on mobile with touch gestures</li>
            </ul>
            <span className="text-green-400 text-sm font-medium group-hover:text-green-300 flex items-center gap-1">
              Open Tool
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* Equation Solver - Coming Soon */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-dashed border-slate-700">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-500 mb-2">
              Equation Solver
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Solve equations step-by-step. Quadratics, cubics, systems, and more.
            </p>
            <span className="text-slate-600 text-sm font-medium">
              Coming Soon
            </span>
          </div>

          {/* Matrix Calculator - Coming Soon */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-dashed border-slate-700">
            <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-500 mb-2">
              Matrix Calculator
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Matrix operations, determinants, eigenvalues, and more.
            </p>
            <span className="text-slate-600 text-sm font-medium">
              Coming Soon
            </span>
          </div>
        </div>

        {/* Use Cases */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-2 text-center">Built for Students</h2>
          <p className="text-slate-400 text-center mb-8 max-w-2xl mx-auto">
            Whether you&apos;re doing homework, studying for exams, or just exploring math,
            MathGraph helps you visualize and understand functions.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <h3 className="font-semibold text-white mb-3">Calculus</h3>
              <p className="text-slate-400 text-sm mb-3">
                Visualize derivatives, integrals, and multivariable functions. See how surfaces
                change as you adjust parameters.
              </p>
              <p className="text-slate-500 text-xs">
                Try: z = sin(x)*cos(y), z = x²+y², z = e^(-x²-y²)
              </p>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <h3 className="font-semibold text-white mb-3">Algebra & Precalculus</h3>
              <p className="text-slate-400 text-sm mb-3">
                Graph polynomials, exponentials, logarithms, and trig functions.
                Find zeros and intersection points automatically.
              </p>
              <p className="text-slate-500 text-xs">
                Try: y = x²-4, y = sin(x), y = 2^x, y = log(x)
              </p>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <h3 className="font-semibold text-white mb-3">Homework Help</h3>
              <p className="text-slate-400 text-sm mb-3">
                Verify your answers visually. Check if your solutions match
                where functions cross or reach minimum/maximum values.
              </p>
              <p className="text-slate-500 text-xs">
                Share graphs via URL with classmates or tutors
              </p>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <h3 className="font-semibold text-white mb-3">Exam Prep</h3>
              <p className="text-slate-400 text-sm mb-3">
                Build intuition for how different functions behave. Understand
                concepts like concavity, asymptotes, and inflection points visually.
              </p>
              <p className="text-slate-500 text-xs">
                Download graphs as PNG for notes or flashcards
              </p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="text-center mb-16">
          <h2 className="text-2xl font-semibold text-white mb-8">Why MathGraph?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">100% Free Forever</h3>
              <p className="text-slate-400 text-sm">
                No accounts, no paywalls, no premium tiers. All features are free for everyone, always.
              </p>
            </div>
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Fast & Modern</h3>
              <p className="text-slate-400 text-sm">
                Built with WebGL and modern JavaScript. No plugins, no Java, no Flash. Works on any device.
              </p>
            </div>
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Shareable Links</h3>
              <p className="text-slate-400 text-sm">
                Every graph has a unique URL. Share with classmates, embed in assignments, or save for later.
              </p>
            </div>
          </div>
        </div>

        {/* Example Equations */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-2 text-center">Try These Equations</h2>
          <p className="text-slate-400 text-center mb-8">
            Click any example to see it graphed instantly
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <h4 className="text-sm font-medium text-blue-400 mb-3">3D Surfaces</h4>
              <div className="space-y-2">
                <Link href="/3d-grapher?z=sin(sqrt(x%5E2%2By%5E2))" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  z = sin(sqrt(x²+y²)) <span className="text-slate-500">- ripple effect</span>
                </Link>
                <Link href="/3d-grapher?z=x%5E2-y%5E2" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  z = x² - y² <span className="text-slate-500">- saddle point</span>
                </Link>
                <Link href="/3d-grapher?z=e%5E(-(x%5E2%2By%5E2))" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  z = e^(-(x²+y²)) <span className="text-slate-500">- Gaussian hill</span>
                </Link>
                <Link href="/3d-grapher?z=sin(x)*cos(y)" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  z = sin(x)cos(y) <span className="text-slate-500">- wave pattern</span>
                </Link>
              </div>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <h4 className="text-sm font-medium text-green-400 mb-3">2D Functions</h4>
              <div className="space-y-2">
                <Link href="/2d-grapher?y=sin(x)" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  y = sin(x) <span className="text-slate-500">- sine wave</span>
                </Link>
                <Link href="/2d-grapher?y=x%5E3-3x" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  y = x³ - 3x <span className="text-slate-500">- cubic with extrema</span>
                </Link>
                <Link href="/2d-grapher?y=1%2Fx" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  y = 1/x <span className="text-slate-500">- hyperbola</span>
                </Link>
                <Link href="/2d-grapher?y=sqrt(x)" className="block text-slate-300 hover:text-white text-sm transition-colors">
                  y = sqrt(x) <span className="text-slate-500">- square root</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Supported Functions */}
        <div className="mb-16 bg-slate-900/30 p-6 rounded-xl border border-slate-800">
          <h2 className="text-xl font-semibold text-white mb-4 text-center">Supported Functions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Basic</h4>
              <p className="text-xs text-slate-500">+, -, *, /, ^, sqrt</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Trigonometric</h4>
              <p className="text-xs text-slate-500">sin, cos, tan, asin, acos, atan</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Exponential</h4>
              <p className="text-xs text-slate-500">exp, log, ln, e^x</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Other</h4>
              <p className="text-xs text-slate-500">abs, floor, ceil, pi, e</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center mt-4">
            Implicit multiplication supported: 2x, xy, 3sin(x), and more
          </p>
        </div>

        {/* Footer */}
        <footer className="text-center border-t border-slate-800 pt-8">
          <p className="text-slate-400 mb-2">Built for students who need math tools that just work.</p>
          <p className="text-sm text-slate-600">
            MathGraph is free and open to everyone. No accounts, no tracking, no nonsense.
          </p>
        </footer>
      </main>
    </div>
  );
}
