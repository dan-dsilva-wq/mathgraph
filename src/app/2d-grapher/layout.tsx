import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2D Grapher - Plot Functions & Equations",
  description: "Free online 2D graphing calculator. Plot functions like y = sin(x), x², and more. Interactive pan, zoom, and multiple function comparison.",
  keywords: ["2D graphing calculator", "function plotter", "y = f(x)", "equation grapher", "online graphing tool", "math visualization"],
  openGraph: {
    title: "2D Grapher - Plot Functions & Equations | MathGraph",
    description: "Free online 2D graphing calculator. Plot multiple functions, pan and zoom interactively.",
    url: "https://mathgraph.vercel.app/2d-grapher",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
