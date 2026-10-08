import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: "../../public/fonts/InterVariable-4.1.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
  style: "normal",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "Crossplay tournaments", template: "%s · Crossplay" },
  description: "Crossplay Swiss tournaments, match results, and standings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="Crossplay tournaments"><span className="wordmark-tile" aria-hidden="true">C</span><span className="wordmark-copy">Crossplay<small>Tournaments</small></span></Link>
          <nav aria-label="Main navigation"><Link href="/">Tournaments</Link><Link href="/admin">Manage</Link></nav>
        </header>
        <main id="main" className="container">{children}</main>
        <footer className="site-footer"><span>Crossplay tournaments</span><span>Every round. Every table.</span></footer>
      </body>
    </html>
  );
}
