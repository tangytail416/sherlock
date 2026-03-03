'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AutoRefreshProps {
  intervalMs?: number;
  isActive: boolean;
}

export function AutoRefresh({ intervalMs = 5000, isActive }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    // If the hunt is completed or failed, stop polling
    if (!isActive) return;

    const interval = setInterval(() => {
      router.refresh(); // Silently fetches fresh Server Component data without a hard reload
    }, intervalMs);

    return () => clearInterval(interval);
  }, [router, intervalMs, isActive]);

  return null; // This component is invisible
}
