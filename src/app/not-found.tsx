import Link from "next/link";
export default function NotFound() { return <div className="empty"><h1>Page not found</h1><p>This page is no longer available.</p><Link className="button secondary" href="/">Tournaments</Link></div>; }
