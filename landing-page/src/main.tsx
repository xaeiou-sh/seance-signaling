import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { PostHogProvider } from "posthog-js/react";
// ARCHIVED: AuthProvider moved to /archive
// import { AuthProvider } from "@/lib/auth-context";
import { TRPCProvider } from "@/lib/trpc-provider";
import { ENV } from "@/env.public";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider
      apiKey={ENV.POSTHOG_KEY}
      options={{
        api_host: ENV.POSTHOG_HOST,
        defaults: "2025-05-24",
        capture_exceptions: true,
        debug: import.meta.env.MODE === "development",
      }}
    >
      {/* ARCHIVED: AuthProvider removed - auth disabled */}
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </PostHogProvider>
  </StrictMode>
);
