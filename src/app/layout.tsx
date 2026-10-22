import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Cormorant_Garamond({ variable: "--font-serif-display", subsets: ["latin"], weight: ["600"] });

export const metadata: Metadata = {
  title: { default: "Vynthera", template: "%s · Vynthera" },
  description: "Drug evidence, off-label status and trial data for physicians, with a source link beside every claim.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
