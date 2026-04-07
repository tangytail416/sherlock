'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ReportsTable } from '@/components/reports/reports-table';
import { FolderDropdown } from '@/components/reports/folder-dropdown';

interface Folder {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  reportCount: number;
}

export default function ReportsPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folder');

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const response = await fetch('/api/reports/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const handleSelectFolder = (id: string | null) => {
    if (id) {
      router.push(`/reports?folder=${id}`);
    } else {
      router.push('/reports');
    }
  };

  const selectedFolder = folderId ? folders.find(f => f.id === folderId) : null;
  const folderName = selectedFolder?.name;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {folderName ? `${folderName} - Investigation reports and findings` : 'Investigation reports and findings'}
            </p>
          </div>
          <FolderDropdown
            selectedFolderId={folderId}
            onSelectFolder={handleSelectFolder}
          />
        </div>

        <ReportsTable folderId={folderId} folderName={folderName} />
      </div>
    </div>
  );
}
