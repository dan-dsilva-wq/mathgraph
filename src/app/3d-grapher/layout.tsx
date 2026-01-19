import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "3D Grapher - Plot 3D Surfaces & Functions",
  description: "Free online 3D graphing calculator. Plot surfaces like z = x² + y², sin(x)cos(y), and more. Interactive rotation, zoom, surface area calculation, and volume between surfaces.",
  keywords: ["3D graphing calculator", "3D surface plotter", "z = f(x,y)", "3D function graph", "surface visualization", "calculus 3D"],
  openGraph: {
    title: "3D Grapher - Plot 3D Surfaces & Functions | MathGraph",
    description: "Free online 3D graphing calculator. Plot surfaces, calculate surface area and volume, find intersections.",
    url: "https://mathgraph.vercel.app/3d-grapher",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
