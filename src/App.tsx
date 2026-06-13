import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/layout/LoginPage";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return <AppShell onLogout={() => setIsAuthenticated(false)} />;
}