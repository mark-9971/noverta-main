import { useState, useEffect, useCallback } from "react";
import { useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Menu, X, MoreHorizontal, Search, Sprout, ChevronRight, LogOut, Lock
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";
import { Toaster, toast } from "sonner";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import { RoleSwitcher } from "./RoleSwitcher";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { DemoBanner } from "@/components/DemoBanner";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { FloatingTimer } from "@/components/floating-timer";
import { SchoolDistrictSelector } from "./SchoolDistrictSelector";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ThemePicker } from "./ThemePicker";
import { useTheme } from "@/lib/theme-context";
import { useTier } from "@/lib/tier-context";
import {
  type NavItem, type NavSection, type RoleThemeConfig,
  roleConfig, platformAdminSection,
} from "./nav-config";

const SHOW_COMING_SOON = false;
const LS_PREFIX = "trellis_nav_";

function useCollapsedSections(sections: NavSection[]) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of sections) {
      if (s.label && s.collapsible) {
        const stored = localStorage.getItem(`${LS_PREFIX}${s.label}`);
        initial[s.label] = stored !== null ? stored === "collapsed" : !(s.defaultOpen ?? true);
      }
    }
    return initial;
  });

  const toggle = useCallback((label: string) => {
    setCollapsed(prev => {
      const next = !prev[label];
      localStorage.setItem(`${LS_PREFIX}${label}`, next ? "collapsed" : "open");
      return { ...prev, [label]: next };
    });
  }, []);

  return { collapsed, toggle };
}

function NavItemRow({
  item, active, theme, config, openAlerts, onNavigate, locked, lockedTierLabel, onLockedClick,
}: {
  item: NavItem;
  active: boolean;
  theme: string;
  config: RoleThemeConfig;
  openAlerts: number;
  onNavigate?: () => void;
  locked?: boolean;
  lockedTierLabel?: string;
  onLockedClick?: () => void;
}) {
  const isLocked = locked && !item.comingSoon;

  const content = (
    <>
      {theme === "open-air" && active && !item.comingSoon && !isLocked && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 bg-emerald-500 rounded-full" />
      )}
      {isLocked ? (
        <Lock className="w-[17px] h-[17px] flex-shrink-0 text-gray-300" />
      ) : (
        <item.icon className={cn(
          "w-[17px] h-[17px] flex-shrink-0",
          item.comingSoon
            ? "text-gray-300"
            : theme === "open-air"
              ? active ? "text-gray-900" : "text-gray-300"
              : active ? config.iconActive : "text-gray-400"
        )} />
      )}
      <span className={cn("flex-1 truncate", isLocked && "text-gray-300")}>{item.label}</span>
      {isLocked && lockedTierLabel && (
        <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
          {lockedTierLabel}
        </span>
      )}
      {item.comingSoon && !isLocked && (
        <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
          Soon
        </span>
      )}
      {item.alertBadge && openAlerts > 0 && !isLocked && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
          {openAlerts > 99 ? "99+" : openAlerts}
        </span>
      )}
    </>
  );

  const baseClasses = "relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-100";

  if (item.comingSoon || isLocked) {
    if (isLocked) {
      return (
        <button
          type="button"
          className={cn(baseClasses, "w-full cursor-pointer text-gray-300 hover:bg-gray-50")}
          title={`${item.label} — Upgrade to ${lockedTierLabel}`}
          onClick={onLockedClick}
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        href="#"
        className={cn(baseClasses, "cursor-default text-gray-300")}
        title={`${item.label} — Coming Soon`}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        baseClasses,
        theme === "open-air"
          ? active
            ? "text-gray-900 font-semibold"
            : "text-gray-400 hover:text-gray-700"
          : active
            ? config.bgActive
            : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
      )}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { role, user, isDevMode, isPlatformAdmin } = useRole();
  const { typedFilter } = useSchoolContext();
  const { theme } = useTheme();
  const { hasAccess, getFeatureInfo, loading: tierLoading } = useTier();
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);
  const openAlerts = ((alertsSummary as Record<string, unknown>)?.total as number) ?? 0;
  const config = roleConfig[role] ?? roleConfig["sped_teacher"];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const rawSections = isPlatformAdmin ? [...config.nav, platformAdminSection] : config.nav;
  const navSections = SHOW_COMING_SOON
    ? rawSections
    : rawSections
        .map(s => ({ ...s, items: s.items.filter(i => !i.comingSoon) }))
        .filter(s => s.items.length > 0);
  const { collapsed, toggle } = useCollapsedSections(navSections);
  const navItems = navSections.flatMap(s => s.items);
  const primaryItems = navItems.filter(i => i.primary && !i.comingSoon);
  const secondaryItems = navItems.filter(i => !i.primary && !i.comingSoon);

  const homeHref = config.homeHref;

  const isSecondaryActive = secondaryItems.some(i =>
    i.href === homeHref ? location === homeHref : location.startsWith(i.href)
  );

  const initials = user.initials || user.name.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "T";

  function isActive(item: NavItem) {
    if (item.comingSoon) return false;
    return item.href === homeHref
      ? location === item.href
      : location.startsWith(item.href);
  }

  function sectionHasActiveItem(section: NavSection) {
    return section.items.some(i => isActive(i));
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Toaster position="top-right" richColors closeButton duration={4000} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0 z-50",
        "fixed inset-y-0 left-0 w-[220px] transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className={cn(
          "px-4 pt-5 pb-3",
          theme === "open-air" ? "border-b border-transparent" : "border-b border-sidebar-border"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {theme === "open-air" ? (
                <div>
                  <p className="text-[15px] font-extrabold text-gray-900 leading-none tracking-tight">{config.label}</p>
                  <p className="text-[11px] text-gray-300 leading-none mt-1.5 tracking-wide">{config.subtitle}</p>
                </div>
              ) : (
                <>
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                    <Sprout className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-gray-900 leading-none tracking-tight">{config.label}</p>
                    <p className="text-[11px] text-gray-400 leading-none mt-1 tracking-wide">{config.subtitle}</p>
                  </div>
                </>
              )}
            </div>
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {isDevMode && <RoleSwitcher />}
          {role !== "sped_student" && (
            <div className="mt-2">
              <SchoolDistrictSelector />
            </div>
          )}
        </div>

        <div className="px-2.5 pt-2.5 pb-1">
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[12px] group",
              theme === "open-air"
                ? "bg-transparent hover:bg-gray-50 text-gray-300 hover:text-gray-500"
                : "bg-gray-50 hover:bg-gray-100 border border-gray-200/70 text-gray-400 hover:text-gray-600"
            )}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white group-hover:border-gray-300 font-mono leading-none">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 px-2.5 py-2 overflow-y-auto">
          {navSections.map((section, si) => {
            const isCollapsible = section.collapsible && !!section.label;
            const isCollapsed = isCollapsible && !!collapsed[section.label!];
            const hasActive = sectionHasActiveItem(section);

            return (
              <div key={section.label ?? si} className={si > 0 ? "mt-3" : ""}>
                {section.label && (
                  isCollapsible ? (
                    <button
                      onClick={() => toggle(section.label!)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2.5 mb-0.5 py-1 rounded-md transition-colors group",
                        "hover:bg-gray-50"
                      )}
                    >
                      <ChevronRight className={cn(
                        "w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0",
                        !isCollapsed && "rotate-90"
                      )} />
                      {section.icon && (
                        <section.icon className={cn(
                          "w-3.5 h-3.5 flex-shrink-0",
                          hasActive && !isCollapsed ? "text-emerald-600" : "text-gray-400"
                        )} />
                      )}
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-widest flex-1 text-left",
                        hasActive && !isCollapsed ? "text-emerald-600" : "text-gray-400"
                      )}>
                        {section.label}
                      </span>
                      {isCollapsed && hasActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      )}
                    </button>
                  ) : (
                    <p className="px-2.5 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      {section.label}
                    </p>
                  )
                )}
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const fk = item.featureKey;
                      const isItemLocked = fk && !tierLoading ? !hasAccess(fk) : false;
                      const tierInfo = fk && isItemLocked ? getFeatureInfo(fk) : null;
                      return (
                        <NavItemRow
                          key={item.href}
                          item={item}
                          active={isActive(item)}
                          theme={theme}
                          config={config}
                          openAlerts={openAlerts}
                          onNavigate={() => setSidebarOpen(false)}
                          locked={isItemLocked}
                          lockedTierLabel={tierInfo?.requiredTierLabel}
                          onLockedClick={() => {
                            toast.info(`${item.label} requires the ${tierInfo?.requiredTierLabel ?? "higher"} plan`, {
                              description: "Contact your administrator or visit Billing to upgrade.",
                              duration: 4000,
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={cn(
          "px-3 py-3",
          theme === "open-air" ? "border-t border-transparent" : "border-t border-sidebar-border"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
              theme === "open-air"
                ? "bg-emerald-50 text-emerald-600"
                : cn("text-white", config.color)
            )}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{user.name}</p>
              <p className={cn(
                "text-[11px] truncate leading-tight mt-0.5",
                theme === "open-air" ? "text-gray-300" : "text-gray-400"
              )}>{user.subtitle}</p>
            </div>
            <ThemePicker />
            <button
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", config.color)}>
              <Sprout className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900 tracking-tight">{config.label}</span>
          </div>
        </header>

        <DemoBanner />
        <SubscriptionBanner />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <SubscriptionGate>{children}</SubscriptionGate>
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border flex items-stretch z-30 safe-area-bottom">
          {primaryItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors relative",
                  active ? config.textColor : "text-gray-400"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.alertBadge && openAlerts > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                    {openAlerts > 99 ? "99+" : openAlerts}
                  </span>
                )}
              </Link>
            );
          })}
          {secondaryItems.length > 0 && (
            <div className="flex-1 relative">
              <button
                className={cn(
                  "w-full flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                  isSecondaryActive ? config.textColor : "text-gray-400"
                )}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-56 z-50 max-h-[70vh] overflow-y-auto">
                    {navSections.map((section, si) => {
                      const secItems = section.items.filter(i => !i.primary && !i.comingSoon);
                      if (secItems.length === 0) return null;
                      return (
                        <div key={section.label ?? si}>
                          {section.label && (
                            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                              {section.label}
                            </p>
                          )}
                          {secItems.map((item) => {
                            const active = isActive(item);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                                  active ? `${config.textColor} bg-gray-50` : "text-gray-600 hover:bg-gray-50"
                                )}
                                onClick={() => setMoreOpen(false)}
                              >
                                <item.icon className="w-4 h-4 flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      </div>

      <FloatingTimer />
    </div>
  );
}
