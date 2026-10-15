import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Wintron OS | Business Workspace",
  description: "Private business management for Wintron Technologies LLC",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
