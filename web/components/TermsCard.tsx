"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { useTerms } from "@/lib/use-terms";

export default function TermsCard() {
  const { show, accept } = useTerms();
  const card = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!show) {
      return;
    }
    action.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        accept();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      // aria-modal claims focus is held here, so hold it
      const stops = card.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!stops?.length) {
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      // a click on the backdrop drops focus outside, so pull it back in
      if (!card.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, accept]);

  if (!show) {
    return null;
  }

  return (
    <div className="terms-scrim">
      <div
        className="terms-card"
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
      >
        <h2 className="terms-title" id="terms-title">
          Terms of use
        </h2>

        <dl className="terms-rows">
          <div className="terms-row">
            <dt className="section-label">No affiliation</dt>
            <dd>
              A personal project, not affiliated with or endorsed by the
              University of Illinois Chicago.
            </dd>
          </div>
          <div className="terms-row">
            <dt className="section-label">No warranty</dt>
            <dd>
              Provided as is. Routes come from incomplete public map data and may
              be wrong. Check accessibility information against the
              university&rsquo;s own guidance.
            </dd>
          </div>
          <div className="terms-row">
            <dt className="section-label">Privacy</dt>
            <dd>
              No accounts or cookies. Anonymous visit counts through Vercel Web
              Analytics. Map tiles come from MapTiler.
            </dd>
          </div>
        </dl>

        <div className="terms-foot">
          <Link className="terms-more" href="/about" onClick={accept}>
            More in About
          </Link>
          <button type="button" className="primary" onClick={accept} ref={action}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
