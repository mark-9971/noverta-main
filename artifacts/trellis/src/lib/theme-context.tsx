import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ThemeId =
  | "open-air"
  | "classic"
  | "high-contrast"
  | "large-text"
  | "extra-large-text"
  | "warm"
  | "warm-edu"
  | "cool"
  | "deuteranopia"
  | "protanopia"
  | "reduced-motion"
  | "midnight-clinic"
  | "oak-paper"
  | "district-blue"
  | "sage"
  | "obsidian";

export const DARK_SIDEBAR_THEMES = new Set<ThemeId>([
  "midnight-clinic",
  "oak-paper",
  "district-blue",
  "sage",
  "obsidian",
]);

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  category: "appearance" | "accessibility" | "sidebar";
}

export const THEMES: ThemeOption[] = [
  { id: "warm-edu", label: "Warm Edu-Trust", description: "Ivory, sage green — warm and educator-centered", category: "appearance" },
  { id: "open-air", label: "Open Air", description: "Borderless, minimal, and spacious", category: "appearance" },
  { id: "classic", label: "Classic", description: "Traditional borders and cards", category: "appearance" },
  { id: "warm", label: "Warm", description: "Soft cream tones", category: "appearance" },
  { id: "cool", label: "Cool", description: "Blue-tinted neutrals", category: "appearance" },
  { id: "high-contrast", label: "High Contrast", description: "Stronger text and borders for readability", category: "accessibility" },
  { id: "large-text", label: "Large Text", description: "16px base for easier reading", category: "accessibility" },
  { id: "extra-large-text", label: "Extra Large Text", description: "18px base, magnified interface", category: "accessibility" },
  { id: "deuteranopia", label: "Deuteranopia-Safe", description: "Green-blind friendly palette", category: "accessibility" },
  { id: "protanopia", label: "Protanopia-Safe", description: "Red-blind friendly palette", category: "accessibility" },
  { id: "reduced-motion", label: "Reduced Motion", description: "Minimal animations", category: "accessibility" },
  { id: "midnight-clinic", label: "Midnight Clinic", description: "Dark teal — focused and clinical", category: "sidebar" },
  { id: "oak-paper", label: "Oak & Paper", description: "Warm amber — earthy and grounded", category: "sidebar" },
  { id: "district-blue", label: "District Blue", description: "Institutional navy — clear and official", category: "sidebar" },
  { id: "sage", label: "Sage", description: "Forest green — calm and biophilic", category: "sidebar" },
  { id: "obsidian", label: "Obsidian", description: "Deep violet — premium and focused", category: "sidebar" },
];

import { migrateLocalGet } from "./storage-migration";

const STORAGE_KEY = "noverta-theme";
const LEGACY_STORAGE_KEY = "trellis-theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "open-air",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      // Read-fallback: prefer the new noverta-theme key; copy-forward
      // from the legacy trellis-theme key on first read.
      const stored = migrateLocalGet(STORAGE_KEY, LEGACY_STORAGE_KEY);
      // "open-air" was the old default — migrate anyone who has it to warm-edu.
      // Explicit choices (anything other than open-air) are preserved.
      if (stored && stored !== "open-air" && THEMES.some(t => t.id === stored)) return stored as ThemeId;
    } catch {}
    return "warm-edu";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}

    const root = document.documentElement;
    THEMES.forEach(t => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${theme}`);

    if (theme === "reduced-motion") {
      root.style.setProperty("--transition-speed", "0s");
    } else {
      root.style.removeProperty("--transition-speed");
    }
  }, [theme]);

  function setTheme(id: ThemeId) {
    setThemeState(id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
