import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { getConfiguredApiBaseUrl } from "@/lib/api-url";

setBaseUrl(getConfiguredApiBaseUrl());

createRoot(document.getElementById("root")!).render(<App />);
