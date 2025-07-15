import { createContext, useContext } from "react";
import { App } from "obsidian";
import type VectorLinkPlugin from "../main";

export interface AppContextType {
  app: App;
  plugin: VectorLinkPlugin;
}
export const AppContext = createContext<AppContextType | undefined>(undefined);

const PluginNotInitialized = () => {
  return (
    <div style={{ padding: 16, color: "var(--text-faint)" }}>
      ❌ Plugin not initialized. Please check your settings.
    </div>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw PluginNotInitialized();
  }
  return context as AppContextType;
};
