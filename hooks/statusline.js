// Verified Development Statusline Hook
// Shows current feature, phase, and context usage in the Claude Code status bar

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default async function statusLine({ cwd }) {
  const parts = [];

  // Read .verified/state.md for current feature and phase
  const statePath = join(cwd, ".verified", "state.md");
  if (existsSync(statePath)) {
    try {
      const content = readFileSync(statePath, "utf-8");
      const featureMatch = content.match(/^feature:\s*(.+)$/m);
      const phaseMatch = content.match(/^phase:\s*(.+)$/m);
      const statusMatch = content.match(/^status:\s*(.+)$/m);

      const feature = featureMatch?.[1]?.trim();
      const phase = phaseMatch?.[1]?.trim();
      const status = statusMatch?.[1]?.trim();

      if (feature && feature !== "none") {
        parts.push(`${feature}`);
      }
      if (phase) {
        const phaseIcon = {
          specify: "spec",
          "ui-spec": "ui",
          plan: "plan",
          implement: "impl",
          verify: "vfy",
          review: "rev",
        }[phase] || phase;
        parts.push(phaseIcon);
      }
      if (status === "blocked") {
        parts.push("BLOCKED");
      }
    } catch {
      // Ignore read errors
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return `vd: ${parts.join(" | ")}`;
}
