import type { UserRole } from "@prisma/client";

// --- All permission keys ---

export const ALL_PERMISSIONS = [
  // Page access
  "VIEW_DASHBOARD",
  "VIEW_TASKS",
  "VIEW_SITES",
  "VIEW_ORDERS",
  "VIEW_CONTACTS",
  "VIEW_EVENTS_LOG",
  "VIEW_ANALYTICS",
  "VIEW_SETTINGS",
  "VIEW_USERS",
  // Actions
  "SIGN_OFF_JOBS",
  "MANAGE_ORDERS",
  "EDIT_PROGRAMME",
  "DELETE_ITEMS",
  "MANAGE_USERS",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// --- Permission metadata ---

export const PERMISSION_META: Record<
  string,
  { label: string; description: string; group: "page" | "action" }
> = {
  VIEW_DASHBOARD: {
    label: "Dashboard",
    description: "Access the main dashboard",
    group: "page",
  },
  VIEW_TASKS: {
    label: "Tasks",
    description: "View and manage tasks",
    group: "page",
  },
  VIEW_SITES: {
    label: "Sites",
    description: "View site details and plots",
    group: "page",
  },
  VIEW_ORDERS: {
    label: "Orders",
    description: "View material orders",
    group: "page",
  },
  VIEW_CONTACTS: {
    label: "Contacts",
    description: "View and manage contacts",
    group: "page",
  },
  VIEW_EVENTS_LOG: {
    label: "Events Log",
    description: "View the events log",
    group: "page",
  },
  VIEW_ANALYTICS: {
    label: "Analytics",
    description: "View analytics and reports",
    group: "page",
  },
  VIEW_SETTINGS: {
    label: "Settings",
    description: "Access account settings",
    group: "page",
  },
  VIEW_USERS: {
    label: "User Management",
    description: "View the users page",
    group: "page",
  },
  SIGN_OFF_JOBS: {
    label: "Sign Off Jobs",
    description: "Can sign off and complete jobs",
    group: "action",
  },
  MANAGE_ORDERS: {
    label: "Manage Orders",
    description: "Can create, edit, and delete orders",
    group: "action",
  },
  EDIT_PROGRAMME: {
    label: "Edit Programme",
    description: "Can edit the site programme",
    group: "action",
  },
  DELETE_ITEMS: {
    label: "Delete Items",
    description: "Can delete sites, plots, and jobs",
    group: "action",
  },
  MANAGE_USERS: {
    label: "Manage Users",
    description: "Can create, edit, delete users and change permissions",
    group: "action",
  },
};

// --- Default permissions per role ---

export const DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  CEO: [...ALL_PERMISSIONS],
  DIRECTOR: [...ALL_PERMISSIONS],
  SITE_MANAGER: ALL_PERMISSIONS.filter(
    (p) => p !== "VIEW_USERS" && p !== "MANAGE_USERS"
  ),
  CONTRACT_MANAGER: [
    "VIEW_DASHBOARD",
    "VIEW_TASKS",
    "VIEW_SITES",
    "VIEW_ORDERS",
    "VIEW_CONTACTS",
    "VIEW_SETTINGS",
    "MANAGE_ORDERS",
  ],
  CONTRACTOR: ["VIEW_DASHBOARD", "VIEW_TASKS", "VIEW_SETTINGS"],
};

// --- Maps sidebar href → required permission ---

export const NAV_PERMISSION_MAP: Record<string, string> = {
  "/dashboard": "VIEW_DASHBOARD",
  "/tasks": "VIEW_TASKS",
  "/sites": "VIEW_SITES",
  "/orders": "VIEW_ORDERS",
  "/contacts": "VIEW_CONTACTS",
  "/events-log": "VIEW_EVENTS_LOG",
  "/analytics": "VIEW_ANALYTICS",
  "/settings": "VIEW_SETTINGS",
  "/users": "VIEW_USERS",
};

// --- Utility ---

export function hasPermission(
  permissions: string[] | undefined,
  key: string
): boolean {
  if (!permissions) return false;
  return permissions.includes(key);
}
