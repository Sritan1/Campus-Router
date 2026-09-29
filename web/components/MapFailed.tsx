"use client";

// a stale tab after a deploy asks for files that are gone, so only a reload helps
export default function MapFailed() {
  return (
    <div className="map-pane map-loading map-failed" role="alert">
      <p>The map could not load.</p>
      <button type="button" className="primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
