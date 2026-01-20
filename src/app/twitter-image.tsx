import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'MathGraph - Free Online Graphing Calculator';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        }}
      >
        {/* Grid background pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            opacity: 0.1,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Logo/Title */}
          <div
            style={{
              fontSize: 80,
              fontWeight: 700,
              color: 'white',
              marginBottom: 20,
              display: 'flex',
            }}
          >
            MathGraph
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8',
              marginBottom: 40,
              display: 'flex',
            }}
          >
            Free Online Graphing Calculator
          </div>

          {/* Feature badges */}
          <div
            style={{
              display: 'flex',
              gap: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#3b82f620',
                color: '#60a5fa',
                padding: '12px 24px',
                borderRadius: 12,
                fontSize: 24,
              }}
            >
              3D Surfaces
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#22c55e20',
                color: '#4ade80',
                padding: '12px 24px',
                borderRadius: 12,
                fontSize: 24,
              }}
            >
              2D Functions
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#a855f720',
                color: '#c084fc',
                padding: '12px 24px',
                borderRadius: 12,
                fontSize: 24,
              }}
            >
              100% Free
            </div>
          </div>
        </div>

        {/* URL at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 24,
            color: '#64748b',
            display: 'flex',
          }}
        >
          mathgraph.vercel.app
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
