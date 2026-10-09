import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PersistStorage } from "./persist-storage";
import { RegisterServiceWorker } from "./register-sw";
import { THEME_KEY } from "@/lib/theme";
import { SiteHeader } from "./site-header";

// Runs before the page paints so a saved light/dark choice never flashes the other theme.
const APPLY_THEME = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: "HanziSave",
  description: "Turn anything you read into flashcards at your level.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0E9A9A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Root layout of the app router, so the fonts load on every page; the rule below is for pages/_document. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <PersistStorage />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
