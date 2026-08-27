"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// Read the currently-effective theme: explicit choice on <html>, else system.
function currentTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
  }
  return systemPrefersDark() ? "dark" : "light";
}

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);

    // If the user hasn't made an explicit choice, follow system changes live.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!localStorage.getItem("chess-theme")) {
        setTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("chess-theme", next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }

  // Render a stable label on the server / first paint to avoid hydration
  // mismatch; the real label appears once mounted.
  const label = !mounted ? "Theme" : theme === "dark" ? "Light" : "Dark";

  return (
    <button
      className="chip-btn"
      onClick={toggle}
      aria-label="Toggle dark mode"
      suppressHydrationWarning
    >
      {label}
    </button>
  );
}
