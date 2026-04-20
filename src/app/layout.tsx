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
  description: "Automatiza flujos de negocio con WhatsApp + IA. Pipeline CRM, Agentes inteligentes y automatización para Pymes en México y LATAM.",
  keywords: ["CRM", "WhatsApp", "IA", "automatización", "SaaS", "Pymes", "México", "LATAM", "chatbot"],
  authors: [{ name: "ValiAutoFlow" }],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
  },
  openGraph: {
    title: "ValiAutoFlow — CRM Inteligente con IA",
    description: "Automatiza flujos de negocio con WhatsApp + IA para Pymes en México y LATAM.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ValiAutoFlow",
    description: "Plataforma de automatización inteligente con WhatsApp + IA para Pymes.",
  },
};

// Script to force light theme and prevent dark mode flash
const themeScript = `
  (function() {
    try {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    } catch(e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900`}
        style={{ backgroundColor: '#ffffff', color: '#111827' }}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
