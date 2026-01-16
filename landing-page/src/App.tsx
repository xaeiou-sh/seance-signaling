import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Download from "@/pages/Download";
import { initPostHog } from "@/lib/posthog";
import { usePageTracking } from "@/lib/usePageTracking";

function AppRoutes() {
  usePageTracking();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/download" element={<Download />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}