'use client';

import { createContext, useContext, ReactNode } from 'react';

interface PageHeaderContextType {
  setHeader: (header: ReactNode) => void;
}

const PageHeaderContext = createContext<PageHeaderContextType | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  return (
    <PageHeaderContext.Provider value={{ setHeader: () => {} }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error('usePageHeader must be used within PageHeaderProvider');
  }
  return context;
}
