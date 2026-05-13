"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={false} // 🔥 important: disables system override
    >
      {children}
    </NextThemesProvider>
  );
}