import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import App from "./App.jsx";
import { SupabaseConvexProvider } from "./components/SupabaseConvexProvider.jsx";
import "../styles.css";

const root = document.getElementById("root");
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const app = <App convexEnabled={Boolean(convexUrl)} />;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

createRoot(root).render(
  <React.StrictMode>
    {convexClient ? <SupabaseConvexProvider client={convexClient}>{app}</SupabaseConvexProvider> : app}
  </React.StrictMode>,
);
