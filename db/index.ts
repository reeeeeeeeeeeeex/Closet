import { localStorage } from "@/lib/local-storage";
export function getDb() { return localStorage().db; }
