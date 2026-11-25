import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consologist TMS",
  description: "Consologist TMS — Task Management System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6d28d9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tms-theme");document.documentElement.dataset.theme=t==="block"?"block":"flat";}catch(e){document.documentElement.dataset.theme="flat";}})();`,
          }}
        />
      </head>
      <body className="antialiased font-body">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
