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
    icon: [
      { url: "/favicon.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [
      { url: "/favicon.png", sizes: "1024x1024", type: "image/png" },
    ],
  },
  openGraph: {
    title: "ValiAutoFlow — CRM Inteligente con IA",
    description: "Automatiza flujos de negocio con WhatsApp + IA para Pymes en México y LATAM.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1344, height: 768, alt: "ValiAutoFlow — CRM Inteligente con IA" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ValiAutoFlow",
    description: "Plataforma de automatización inteligente con WhatsApp + IA para Pymes.",
  },
};

// Script to prevent dark mode flash
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('valiflow-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
