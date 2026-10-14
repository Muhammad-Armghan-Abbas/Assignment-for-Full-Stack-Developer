import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "@/components/ui/Toaster";

export const metadata: Metadata = {
  title: { default: "Ajaia Docs", template: "%s · Ajaia Docs" },
  description: "Write, review and ship documents together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
