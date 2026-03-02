export type DatabaseType = "drizzle" | "mongo";

export interface DashboardConfig {
  title: string;
  authClient: "drizzle" | "mongo";
  logoutHref: string;
  dbType: DatabaseType;
}

export const dashboardConfigs: Record<DatabaseType, DashboardConfig> = {
  drizzle: {
    title: "Drizzle ORM Test Dashboard",
    authClient: "drizzle",
    logoutHref: "/drizzle/login",
    dbType: "drizzle",
  },
  mongo: {
    title: "Mongo Test Dashboard",
    authClient: "mongo",
    logoutHref: "/mongo/login",
    dbType: "mongo",
  },
};
