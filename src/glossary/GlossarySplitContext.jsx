import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const GlossarySplitContext = createContext(null);

export function GlossarySplitProvider({ children }) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [activeTermId, setActiveTermId] = useState(null);

  const openTerm = useCallback((termId) => {
    setActiveTermId(termId);
    setSplitOpen(true);
  }, []);

  const closeSplit = useCallback(() => {
    setSplitOpen(false);
    setActiveTermId(null);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closeSplit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSplit]);

  const value = useMemo(
    () => ({ splitOpen, activeTermId, openTerm, closeSplit }),
    [splitOpen, activeTermId, openTerm, closeSplit]
  );

  return <GlossarySplitContext.Provider value={value}>{children}</GlossarySplitContext.Provider>;
}

export function useGlossarySplit() {
  const ctx = useContext(GlossarySplitContext);
  if (!ctx) {
    throw new Error("useGlossarySplit must be used within GlossarySplitProvider");
  }
  return ctx;
}

export function useGlossarySplitOptional() {
  return useContext(GlossarySplitContext);
}
