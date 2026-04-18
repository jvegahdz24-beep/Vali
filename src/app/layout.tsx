import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/styles/design-tokens.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ValiAutoFlow — CRM Inteligente con IA",
  description: "Automatiza ventas con WhatsApp + IA. Pipeline CRM, Agentes inteligentes y automatización para el sector automotriz.",
  keywords: ["CRM", "WhatsApp", "IA", "ventas", "automotriz", "SaaS", "automatización"],
  authors: [{ name: "ValiAutoFlow" }],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>",
  },
  openGraph: {
    title: "ValiAutoFlow — CRM Inteligente con IA",
    description: "Automatiza ventas con WhatsApp + IA para el sector automotriz mexicano.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ValiAutoFlow",
    description: "CRM Inteligente con IA para ventas automotrices.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        style={{ backgroundColor: '#ffffff' }}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
