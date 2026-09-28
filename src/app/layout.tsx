import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Crossplay tournaments", template: "%s · Crossplay" },
  description: "Crossplay Swiss tournaments, match results, and standings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="wordmark" href="/">Crossplay</Link>
          <nav aria-label="Main navigation"><Link href="/">Tournaments</Link><Link href="/admin">Manage</Link></nav>
        </header>
        <main id="main" className="container">{children}</main>
        <footer className="site-footer">Crossplay tournaments</footer>
      </body>
    </html>
  );
}
