import type { Metadata } from "next";
import "./globals.css";
import { ResumeProvider } from "@/contexts/ResumeContext";

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
      <body className="antialiased font-sans min-h-screen">
        <ResumeProvider>
          {children}
        </ResumeProvider>
      </body>
    </html>
  );
}
