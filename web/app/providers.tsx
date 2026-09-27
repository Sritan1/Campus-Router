"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import TermsCard from "@/components/TermsCard";

export default function Providers({ children }: { children: ReactNode }) {
  // made lazily, so one client per browser session and none shared on the server
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <TermsCard />
    </QueryClientProvider>
  );
}
