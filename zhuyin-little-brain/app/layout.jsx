import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "注音小腦袋",
  description: "A playful zhuyin learning app prototype built with Next.js for Vercel.",
  other: {
    "google-adsense-account": "ca-pub-8259926232293889"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>
        <Script
          id="google-adsense"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8259926232293889"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
