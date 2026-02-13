import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app"
});

export const metadata: Metadata = {
  title: "LifeOS",
  description: "Unified household operations system"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${appFont.variable} min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
