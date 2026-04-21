import { useState } from "react";
import { Palette, Check, Eye, Accessibility, Sidebar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, THEMES, type ThemeId } from "@/lib/theme-context";

const SWATCH_COLORS: Record<ThemeId, string> = {
  "warm-edu": "bg-amber-50 border-amber-300",
  "open-air": "bg-white border-gray-200",
  "classic": "bg-white border-gray-400",
  "high-contrast": "bg-black border-black",
  "large-text": "bg-white border-emerald-400",
  "extra-large-text": "bg-white border-emerald-600",
  "warm": "bg-amber-50 border-amber-300",
  "cool": "bg-blue-50 border-blue-300",
  "deuteranopia": "bg-blue-100 border-blue-500",
  "protanopia": "bg-sky-100 border-sky-500",
  "reduced-motion": "bg-gray-100 border-gray-400",
  "midnight-clinic": "bg-teal-900 border-teal-500",
  "oak-paper": "bg-amber-900 border-amber-500",
  "district-blue": "bg-blue-900 border-blue-400",
  "sage": "bg-emerald-900 border-emerald-500",
  "obsidian": "bg-violet-950 border-violet-500",
};

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const appearanceThemes = THEMES.filter(t => t.category === "appearance");
  const a11yThemes = THEMES.filter(t => t.category === "accessibility");
  const sidebarThemes = THEMES.filter(t => t.category === "sidebar");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors flex-shrink-0"
        title="Change theme"
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 w-72 z-[61] overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-[13px] font-semibold text-gray-900">Theme</p>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-3 pb-2">
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <Eye className="w-3 h-3 text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Appearance</p>
              </div>
              <div className="space-y-0.5">
                {appearanceThemes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                      theme === t.id ? "bg-emerald-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-md border-2 flex-shrink-0", SWATCH_COLORS[t.id])} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[12px] font-medium", theme === t.id ? "text-emerald-700" : "text-gray-700")}>{t.label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{t.description}</p>
                    </div>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-2">
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <Sidebar className="w-3 h-3 text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sidebar</p>
              </div>
              <div className="space-y-0.5">
                {sidebarThemes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                      theme === t.id ? "bg-emerald-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-md border-2 flex-shrink-0", SWATCH_COLORS[t.id])} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[12px] font-medium", theme === t.id ? "text-emerald-700" : "text-gray-700")}>{t.label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{t.description}</p>
                    </div>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-3">
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <Accessibility className="w-3 h-3 text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Accessibility</p>
              </div>
              <div className="space-y-0.5">
                {a11yThemes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                      theme === t.id ? "bg-emerald-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded-md border-2 flex-shrink-0", SWATCH_COLORS[t.id])} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[12px] font-medium", theme === t.id ? "text-emerald-700" : "text-gray-700")}>{t.label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{t.description}</p>
                    </div>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
