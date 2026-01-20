import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '3D Surface Grapher - MathGraph';
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
        {/* 3D-style grid background */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0.15,
          }}
          viewBox="0 0 1200 630"
        >
          {/* Perspective grid lines */}
          {[...Array(12)].map((_, i) => (
            <line
              key={`v${i}`}
              x1={100 + i * 100}
              y1={100}
              x2={600 + (i - 5) * 50}
              y2={530}
              stroke="#3b82f6"
              strokeWidth="1"
            />
          ))}
          {[...Array(8)].map((_, i) => (
            <line
              key={`h${i}`}
              x1={100}
              y1={100 + i * 60}
              x2={1100}
              y2={100 + i * 60 + (i * 20)}
              stroke="#3b82f6"
              strokeWidth="1"
            />
          ))}
        </svg>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 80,
              height: 80,
              backgroundColor: '#3b82f620',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: 'white',
              marginBottom: 16,
              display: 'flex',
            }}
          >
            3D Surface Grapher
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 28,
              color: '#94a3b8',
              marginBottom: 32,
              display: 'flex',
            }}
          >
            Visualize multivariable functions in 3D
          </div>

          {/* Example equation */}
          <div
            style={{
              fontSize: 36,
              color: '#60a5fa',
              fontFamily: 'monospace',
              backgroundColor: '#1e293b',
              padding: '16px 32px',
              borderRadius: 12,
              border: '1px solid #334155',
              display: 'flex',
            }}
          >
            z = sin(x) * cos(y)
          </div>
        </div>

        {/* Branding */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: 'white',
              display: 'flex',
            }}
          >
            MathGraph
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#64748b',
              display: 'flex',
            }}
          >
            - Free Online Graphing
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
