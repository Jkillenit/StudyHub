import { createContext, useContext, useMemo, useState } from "react";

const FlashcardDeckContext = createContext(null);

export function FlashcardDeckProvider({ children }) {
  const [panelApi, setPanelApi] = useState(null);
  const value = useMemo(() => ({ panelApi, setPanelApi }), [panelApi]);
  return <FlashcardDeckContext.Provider value={value}>{children}</FlashcardDeckContext.Provider>;
}

export function useFlashcardDeckContext() {
  const ctx = useContext(FlashcardDeckContext);
  if (!ctx) return { panelApi: null, setPanelApi: () => {} };
  return ctx;
}
