import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";
import DashboardLayout from "./dashboard-layout";
import { NavigationLoader } from "@/components/NavigationLoader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RenderMe.Live - Transform your floor plans",
  description: "Upload a sketch, single-line plan, or CAD screenshot and get a client-ready render in seconds.",
  icons: {
    icon: "/favicon-new.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <TooltipProvider>
            <NavigationLoader />
            <DashboardLayout>
              {children}
            </DashboardLayout>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </Providers>
      </body>

    </html>
  );
}
