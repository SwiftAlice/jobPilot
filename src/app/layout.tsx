import type { Metadata } from "next";
import "./globals.css";
import { ResumeProvider } from "@/contexts/ResumeContext";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "JobPilot AI",
  description: "JobPilot AI — Build. Tailor. Apply. Your AI copilot for careers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="antialiased font-sans min-h-screen">
        <ResumeProvider>
          <Navigation />
          {children}
        </ResumeProvider>
      </body>
    </html>
  );
}
