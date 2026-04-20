import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initSentry } from "@/lib/sentry";
import "@/lib/screenshot-mode";

initSentry();

createRoot(document.getElementById("root")!).render(<App />);
