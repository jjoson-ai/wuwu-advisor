import type { Metadata } from "next";
import "./globals.css";

import { AccessStateRefresh } from "@/components/access-state-refresh";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { PaidMediaBridge } from "@/components/paid-media-bridge";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AccessStateRefresh />
        <PaidMediaBridge />
        <div className="shell">
          <Header />
          <main className="page">
            <div className="container page-frame">{children}</div>
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
