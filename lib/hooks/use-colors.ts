'use client';

import { useState, useEffect } from 'react';
import { 
  DEFAULT_COLORS, 
  ColorStyle, 
  getSeverityClasses, 
  getStatusClasses, 
  getInvestigationStatusClasses 
} from '@/lib/constants/colors';

export type { ColorStyle };
export { getSeverityClasses, getStatusClasses, getInvestigationStatusClasses };

export function useColorConfigs() {
  const [colors, setColors] = useState<Record<string, Record<string, ColorStyle>>>(DEFAULT_COLORS);

  useEffect(() => {
    fetch('/api/color-config')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const colorMap: Record<string, Record<string, ColorStyle>> = {};
          for (const config of data) {
            colorMap[config.category] = config.colors;
          }
          setColors(colorMap);
        }
      })
      .catch(() => {});
  }, []);

  return colors;
}

export { DEFAULT_COLORS };
