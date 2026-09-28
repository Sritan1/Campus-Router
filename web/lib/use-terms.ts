"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "campus-router.terms.v2";

// storage throws in a private window
function seen(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return true;
  }
}

function remember(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    return;
  }
}

export function useTerms() {
  const [show, setShow] = useState(false);

  // after mount, or the server renders a card the client removes
  useEffect(() => {
    setShow(!seen());
  }, []);

  const accept = useCallback(() => {
    setShow(false);
    remember();
  }, []);

  return { show, accept };
}
