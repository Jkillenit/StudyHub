import { createContext, useContext, useMemo, useState } from "react";

const ShellContext = createContext(null);

export function ShellProvider({ children }) {
  const [breadcrumb, setBreadcrumb] = useState(() => ["STUDY HUB"]);
  const [apiLive, setApiLive] = useState(false);
  const [courseNav, setCourseNav] = useState(null);
  const [prompt, setPrompt] = useState(null);
  /** `{ kind: "quiz" | "cards" }` while a SessionShell is mounted, else null. */
  const [session, setSession] = useState(null);

  const value = useMemo(
    () => ({
      breadcrumb,
      setBreadcrumb,
      apiLive,
      setApiLive,
      courseNav,
      setCourseNav,
      prompt,
      setPrompt,
      session,
      setSession,
    }),
    [apiLive, breadcrumb, courseNav, prompt, session]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const v = useContext(ShellContext);
  if (!v) throw new Error("useShell: missing ShellProvider");
  return v;
}
