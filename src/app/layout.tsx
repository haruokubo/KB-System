import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppInsights } from "@/components/app-insights";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KB System",
  description: "Fornida internal knowledge base and AI-assisted troubleshooting search for L2/L3 support engineers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppInsights />
        {children}
      </body>
    </html>
  );
}
