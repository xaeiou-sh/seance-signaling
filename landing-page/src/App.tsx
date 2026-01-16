import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Download from "@/pages/Download";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import TestTRPC from "@/pages/TestTRPC";
import { initPostHog } from "@/lib/posthog";
import { usePageTracking } from "@/lib/usePageTracking";

function AppRoutes() {
  usePageTracking();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/download" element={<Download />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/test-trpc" element={<TestTRPC />} />
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