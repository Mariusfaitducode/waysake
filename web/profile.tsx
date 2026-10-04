import { createContext, useContext } from "react";
import type { User } from "./api.js";

export const ProfileCtx = createContext<{ me: User; switchProfile: () => void } | null>(null);
export const useProfile = () => useContext(ProfileCtx)!;
