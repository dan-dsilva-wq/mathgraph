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
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Free online math tools for students. Visualize 3D functions, plot equations, and explore mathematics interactively.
          </p>
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
              3D Grapher
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Plot 3D surfaces like z = x² + y², sin(x)cos(y), and more. Interactive rotation and zoom.
            </p>
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
              2D Grapher
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Plot 2D functions like y = sin(x), quadratics, and more. Pan and zoom interactively.
            </p>
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

        {/* Features */}
        <div className="text-center mb-16">
          <h2 className="text-xl font-semibold text-white mb-8">Why MathGraph?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">100% Free</h3>
              <p className="text-slate-400 text-sm">
                No sign-up, no paywalls, no premium features. Everything is free.
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
                Built with modern tech. No Java applets or Flash. Works on any device.
              </p>
            </div>
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Shareable</h3>
              <p className="text-slate-400 text-sm">
                Share your graphs with a link. Great for homework help or teaching.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-sm text-slate-600">
          <p>Built for students, by someone who gets it.</p>
        </footer>
      </main>
    </div>
  );
}
