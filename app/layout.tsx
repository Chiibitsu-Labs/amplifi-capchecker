import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Amplifi Capacity Instrument",
  description: "Daily team capacity check-ins",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e24",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ margin: 0, background: "#0a0e24" }}>{children}</body>
    </html>
  );
}
