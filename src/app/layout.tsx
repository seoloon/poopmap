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
  appleWebApp: { capable: true, title: "Caca'rte", statusBarStyle: "default" },
  icons: {
    icon: "/cacarte-logo.svg",
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
