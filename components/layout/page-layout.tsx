'use client';

import { ReactNode } from 'react';

interface PageLayoutProps {
  header?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ header, children }: PageLayoutProps) {
  return (
    <>
      {header && (
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="px-4 md:px-6 py-3 md:py-4">
            {header}
          </div>
        </div>
      )}
      <div className="container mx-auto p-4 md:p-6">
        {children}
      </div>
    </>
  );
}
