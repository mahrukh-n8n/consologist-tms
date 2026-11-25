import { Role } from "@/generated/prisma/enums";

/** Permission-controlled application modules. */
export type Module =
  | "dashboard"
  | "projects"
  | "tasks"
  | "discussions"
  | "files"
  | "calendar"
  | "time"
  | "settings"
  | "admin";

export type Action = "read" | "comment" | "write" | "delete" | "admin";

const ALL: Action[] = ["read", "comment", "write", "delete", "admin"];
const READ: Action[] = ["read"];
const COMMENT: Action[] = ["read", "comment"];
const WRITE: Action[] = ["read", "comment", "write"];
const DELETE: Action[] = ["read", "comment", "write", "delete"];

const every = (actions: Action[]): Record<Module, Action[]> => ({
  dashboard: actions,
  projects: actions,
  tasks: actions,
  discussions: actions,
  files: actions,
  calendar: actions,
  time: actions,
  settings: actions,
  admin: actions,
});

export const PERMISSION_MATRIX: Record<Role, Record<Module, Action[]>> = {
  [Role.READ_ONLY]: every(READ),
  [Role.COMMENT]: every(COMMENT),
  [Role.WRITE]: { ...every(WRITE), settings: READ, admin: [] },
  [Role.DELETE]: { ...every(DELETE), settings: READ, admin: [] },
  [Role.ADMIN]: { ...every(ALL), settings: ALL, admin: ["read", "write", "admin"] },
  [Role.SUPER_ADMIN]: every(ALL),
};

export const ALL_MODULES: Module[] = [
  "dashboard",
  "projects",
  "tasks",
  "discussions",
  "files",
  "calendar",
  "time",
  "settings",
  "admin",
];

export const ALL_ACTIONS: Action[] = ALL;
export const ADMIN_ROLES: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

export function hasPermission(role: Role, module: Module, action: Action): boolean {
  return PERMISSION_MATRIX[role][module].includes(action);
}
