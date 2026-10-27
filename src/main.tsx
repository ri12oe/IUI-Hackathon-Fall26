import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import Host from "./pages/Host";
import Join from "./pages/Join";
import Report from "./pages/Report";
import "./styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/join" replace />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/report/:code" element={<Report />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);