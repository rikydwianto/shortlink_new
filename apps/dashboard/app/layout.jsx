import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["500", "600", "700", "800"]
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"]
});

export const metadata = {
  title: "Shortlink Dashboard",
  description: "Dashboard MVP untuk aplikasi shortlink"
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
