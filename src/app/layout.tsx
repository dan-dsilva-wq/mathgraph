import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MathGraph - Free Online Math Graphing Tools",
    template: "%s | MathGraph",
  },
  description: "Free online graphing calculators for students. Plot 2D and 3D mathematical functions, visualize surfaces, and explore math interactively. No sign-up required.",
  keywords: ["graphing calculator", "3D graphing", "2D graphing", "math visualization", "surface plotter", "function graph", "online math tools", "free calculator"],
  authors: [{ name: "MathGraph" }],
  creator: "MathGraph",
  metadataBase: new URL("https://mathgraph.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://mathgraph.vercel.app",
    siteName: "MathGraph",
    title: "MathGraph - Free Online Math Graphing Tools",
    description: "Free online graphing calculators for students. Plot 2D and 3D mathematical functions, visualize surfaces, and explore math interactively.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MathGraph - Free Online Math Graphing Tools",
    description: "Free online graphing calculators for students. Plot 2D and 3D functions interactively.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// JSON-LD structured data for the site
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "MathGraph",
  "description": "Free online graphing calculators for students. Plot 2D and 3D mathematical functions.",
  "url": "https://mathgraph.vercel.app",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "3D surface plotting",
    "2D function graphing",
    "Interactive zoom and pan",
    "Surface area calculation",
    "Volume calculation",
    "Share graphs via URL",
    "Download as PNG"
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
