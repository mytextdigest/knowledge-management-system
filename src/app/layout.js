import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProviderWrapper from "@/components/auth/SessionProviderWrapper";
import { ThemeProvider } from "@/utils/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "KMS - Document Management System",
  description: "A modern document management system for organizing and processing your text files",
};

export async function generateStaticParams() {
  return [];
}

// export const dynamicParams = true;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <SessionProviderWrapper>
              {children}
          </SessionProviderWrapper>
        </ThemeProvider>
          

        
      </body>
    </html>
  );
}
