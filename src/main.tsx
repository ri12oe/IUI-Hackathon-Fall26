import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import HostSetup from "./pages/host/HostSetup";
import HostSession from "./pages/host/HostSession";
import Join from "./pages/Join";
import Report from "./pages/Report";
import NotFound from "./pages/NotFound";

import "./styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/join" replace />} />
        <Route path="/join" element={<Join />} />
        <Route path="/host" element={<HostSetup />} />
        <Route path="/host/:code" element={<HostSession />} />
        <Route path="/report/:code" element={<Report />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);