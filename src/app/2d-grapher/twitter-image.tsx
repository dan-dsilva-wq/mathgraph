import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '2D Function Grapher - MathGraph';
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
        {/* 2D coordinate grid background */}
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
          {/* Vertical grid lines */}
          {[...Array(24)].map((_, i) => (
            <line
              key={`v${i}`}
              x1={50 + i * 50}
              y1={0}
              x2={50 + i * 50}
              y2={630}
              stroke="#22c55e"
              strokeWidth={i === 11 ? 2 : 1}
            />
          ))}
          {/* Horizontal grid lines */}
          {[...Array(13)].map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * 50 + 15}
              x2={1200}
              y2={i * 50 + 15}
              stroke="#22c55e"
              strokeWidth={i === 6 ? 2 : 1}
            />
          ))}
          {/* Sample sine wave */}
          <path
            d="M 100 315 Q 200 115 300 315 T 500 315 T 700 315 T 900 315 T 1100 315"
            fill="none"
            stroke="#4ade80"
            strokeWidth="3"
            opacity="0.6"
          />
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
              backgroundColor: '#22c55e20',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
              <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
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
            2D Function Grapher
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
            Plot any y = f(x) function instantly
          </div>

          {/* Example equation */}
          <div
            style={{
              fontSize: 36,
              color: '#4ade80',
              fontFamily: 'monospace',
              backgroundColor: '#1e293b',
              padding: '16px 32px',
              borderRadius: 12,
              border: '1px solid #334155',
              display: 'flex',
            }}
          >
            y = sin(x)
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
