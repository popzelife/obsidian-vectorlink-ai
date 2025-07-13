import { createContext, useContext } from "react";
import { App } from "obsidian";
import type VectorLinkPlugin from "../main";

export interface AppContextType {
  app: App;
  plugin: VectorLinkPlugin;
}
export const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = (): AppContextType | undefined => {
  return useContext(AppContext);
};
