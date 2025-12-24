import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState, useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type ThemePreference = "light" | "dark" | "system";

function getEffectiveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

function applyTheme(effectiveTheme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", effectiveTheme === "dark");
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const updateEffectiveTheme = useCallback((pref: ThemePreference) => {
    const effective = getEffectiveTheme(pref);
    setEffectiveTheme(effective);
    applyTheme(effective);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("themePreference") as ThemePreference | null;
    const initial = stored || "system";
    setPreference(initial);
    updateEffectiveTheme(initial);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (preference === "system") {
        updateEffectiveTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handleChange);

    fetch("/api/account", { credentials: "include" })
      .then((res) => {
        if (res.ok) {
          setIsLoggedIn(true);
          return res.json();
        }
        return null;
      })
      .then((data) => {
        if (data?.themePreference && data.themePreference !== initial) {
          setPreference(data.themePreference);
          localStorage.setItem("themePreference", data.themePreference);
          updateEffectiveTheme(data.themePreference);
        }
      })
      .catch(() => {});

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (preference === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => updateEffectiveTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [preference, updateEffectiveTheme]);

  const handleSelect = async (newPref: ThemePreference) => {
    setPreference(newPref);
    localStorage.setItem("themePreference", newPref);
    updateEffectiveTheme(newPref);

    if (isLoggedIn) {
      try {
        await apiRequest("PATCH", "/api/account", { themePreference: newPref });
        queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      } catch (err) {
        console.error("Failed to save theme preference:", err);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          data-testid="button-theme-toggle"
        >
          {effectiveTheme === "light" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleSelect("light")}
          data-testid="menu-item-theme-light"
        >
          <Sun className="mr-2 h-4 w-4" />
          Light
          {preference === "light" && <span className="ml-auto text-muted-foreground">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSelect("dark")}
          data-testid="menu-item-theme-dark"
        >
          <Moon className="mr-2 h-4 w-4" />
          Dark
          {preference === "dark" && <span className="ml-auto text-muted-foreground">Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSelect("system")}
          data-testid="menu-item-theme-system"
        >
          <Monitor className="mr-2 h-4 w-4" />
          System
          {preference === "system" && <span className="ml-auto text-muted-foreground">Active</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
