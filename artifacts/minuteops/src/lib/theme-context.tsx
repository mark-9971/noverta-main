import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type ThemeId =
  | "open-air"
  | "classic"
  | "high-contrast"
  | "large-text"
  | "extra-large-text"
  | "warm"
  | "cool"
  | "deuteranopia"
  | "protanopia"
  | "reduced-motion";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  category: "appearance" | "accessibility";
}

export const THEMES: ThemeOption[] = [
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
];

const STORAGE_KEY = "trellis-theme";

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
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES.some(t => t.id === stored)) return stored as ThemeId;
    } catch {}
    return "open-air";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}

    const root = document.documentElement;
    THEMES.forEach(t => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${t.id}`);

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
