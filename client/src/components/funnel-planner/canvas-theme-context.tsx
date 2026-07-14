import { createContext, useContext } from "react";

export type CanvasTheme = "dark" | "light";
export const CanvasThemeContext = createContext<CanvasTheme>("dark");
export function useCanvasTheme(): CanvasTheme { return useContext(CanvasThemeContext); }
