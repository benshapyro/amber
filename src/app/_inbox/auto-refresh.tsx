"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While anything is still processing, re-fetch the page every few seconds
// so thumbnails appear without a manual reload.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
