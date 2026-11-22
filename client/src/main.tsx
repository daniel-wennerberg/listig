import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/dm-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import Home from "./pages/Home";
import ItemPage from "./pages/ItemPage";
import ListPage from "./pages/ListPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/l/:id" element={<ListPage />} />
        <Route path="/l/:id/i/:itemId" element={<ItemPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
