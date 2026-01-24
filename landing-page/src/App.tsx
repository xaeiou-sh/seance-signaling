import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Download from "@/pages/Download";
import Checkout from "@/pages/Checkout";
// ARCHIVED: Auth pages moved to /archive
// import Login from "@/pages/Login";
// import Signup from "@/pages/Signup";
// import Signout from "@/pages/Signout";
import Dashboard from "@/pages/Dashboard";
import TestTRPC from "@/pages/TestTRPC";
import PleaseSupport from "@/pages/PleaseSupport";
import { initPostHog } from "@/lib/posthog";
import { usePageTracking } from "@/lib/usePageTracking";

function AppRoutes() {
  usePageTracking();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/download" element={<Download />} />
      <Route path="/checkout" element={<Checkout />} />
      {/* ARCHIVED: Auth routes disabled */}
      {/* <Route path="/login" element={<Login />} /> */}
      {/* <Route path="/signup" element={<Signup />} /> */}
      {/* <Route path="/signout" element={<Signout />} /> */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/test-trpc" element={<TestTRPC />} />
      <Route path="/please-support" element={<PleaseSupport />} />
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