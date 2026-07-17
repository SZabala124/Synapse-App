import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App.jsx";
import "../styles.css";

const root = document.getElementById("root");
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const app = <App convexEnabled={Boolean(convexUrl)} />;

createRoot(root).render(
  <React.StrictMode>
    {convexUrl ? <ConvexProvider client={new ConvexReactClient(convexUrl)}>{app}</ConvexProvider> : app}
  </React.StrictMode>,
);
