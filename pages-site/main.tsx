import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClimbGame } from "@/components/climb-game";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ClimbGame />
    </StrictMode>,
  );
}
