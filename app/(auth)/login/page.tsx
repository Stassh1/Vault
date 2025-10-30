import { Metadata } from "next";

import { GTMComponent } from "@/components/gtm-component";

import LoginClient from "./page-client";

const data = {
  description: "Login to Datavault",
  title: "Login | Datavault",
  url: "/login",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.datavault.com"),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "Datavault",
    images: [
      {
        url: "/_static/meta-image.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    creator: "@datavaultio",
    images: ["/_static/meta-image.png"],
  },
};

export default function LoginPage() {
  return (
    <>
      <GTMComponent />
      <LoginClient />
    </>
  );
}
