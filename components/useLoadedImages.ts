import { useEffect, useState } from 'react';

// Which of these image URLs actually load. Lets prize photos be dropped into
// public/ at any time: until a file exists, callers show a text/icon fallback.
export const useLoadedImages = (srcs: (string | undefined)[]): Set<string> => {
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const key = srcs.filter(Boolean).join('|');

  useEffect(() => {
    let cancelled = false;
    srcs.forEach(src => {
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setLoaded(prev => new Set(prev).add(src));
      };
      img.src = src;
    });
    return () => { cancelled = true; };
  }, [key]);

  return loaded;
};
