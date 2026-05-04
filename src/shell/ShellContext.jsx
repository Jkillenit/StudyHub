import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ShellContext = createContext(null);

export function ShellProvider({ children }) {
  const [breadcrumb, setBreadcrumb] = useState(() => ["STUDY HUB"]);
  const [statusLeft, setStatusLeft] = useState(() => []);
  const [statusRight, setStatusRight] = useState(() => []);
  const [apiLive, setApiLive] = useState(false);

  const setStatusBar = useCallback((parts) => {
    setStatusLeft(parts?.left ?? []);
    setStatusRight(parts?.right ?? []);
  }, []);

  const value = useMemo(
    () => ({
      breadcrumb,
      setBreadcrumb,
      statusLeft,
      statusRight,
      setStatusBar,
      apiLive,
      setApiLive,
    }),
    [apiLive, breadcrumb, statusLeft, statusRight, setStatusBar]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const v = useContext(ShellContext);
  if (!v) throw new Error("useShell: missing ShellProvider");
  return v;
}
