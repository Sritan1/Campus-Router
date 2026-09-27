import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="shell">
      <div className="fatal">
        <h1 className="fatal-title">Page not found</h1>
        <p className="fatal-body">
          That address does not match anything on this site. The link may be out
          of date, or the address may have a typo.
        </p>
        <Link className="primary" href="/">
          Back to routing
        </Link>
      </div>
    </main>
  );
}
