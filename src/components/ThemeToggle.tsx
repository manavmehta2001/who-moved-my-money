"use client";

import { useSyncExternalStore } from "react";

type Choice = "system" | "light" | "dark";
const KEY = "wmm-theme";
const NEXT: Record<Choice, Choice> = { system: "light", light: "dark", dark: "system" };
const SHORT: Record<Choice, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** Runs before paint (inlined in <head>) so the chosen theme never flashes. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function read(): Choice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const CHANGE_EVENT = "wmm-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as Choice);

  function cycle() {
    const next = NEXT[choice];
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice just won't persist */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <button type="button" className="icon-button" onClick={cycle} aria-label={`${SHORT[choice]} theme. Change theme`}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor" />
      </svg>
      <span className="theme-label">{SHORT[choice]}</span>
    </button>
  );
}
