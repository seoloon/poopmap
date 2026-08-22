import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-display",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Caca'rte 💩 — Trouve le trône le plus proche",
  description:
    "La carte collaborative des toilettes publiques en France : trouve, référence et note les petits coins près de toi.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💩</text></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffe66d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${baloo.variable} ${nunito.variable}`}>
      <body className="font-body text-ink antialiased">{children}</body>
    </html>
  );
}
