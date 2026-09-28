"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { useState, type ReactNode } from "react";

import TermsCard from "@/components/TermsCard";

// the page is enough, so the buildings in a shared link stay out
function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: event.url.split("?")[0] };
}

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
      <Analytics beforeSend={withoutQuery} />
    </QueryClientProvider>
  );
}
