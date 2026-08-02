"use client";

import { NextUIProvider } from "@nextui-org/react";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <NextUIProvider navigate={router.push}>
      <main className="text-foreground bg-background h-screen w-screen overflow-hidden">
        {children}
      </main>
    </NextUIProvider>
  );
}
