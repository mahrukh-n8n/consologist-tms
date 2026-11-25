import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const APPLICATIONS = [
  { appKey: "tasks", title: "Tasks", singularName: "Task", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "discussions", title: "Discussions", singularName: "Discussion", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "milestones", title: "Milestones", singularName: "Milestone", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "time", title: "Time", singularName: "Time record", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "files", title: "Files", singularName: "File", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "bugtracker", title: "Issue Tracker", singularName: "Issue", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "wiki", title: "Wiki", singularName: "Wiki", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "calendar", title: "Calendar", singularName: "Calendar event", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "overview", title: "Overview", singularName: "Overview", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "planner", title: "Planner", singularName: "Item", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "translations", title: "Translations", singularName: "Phrase", kind: "PROJECT" as const, viewType: "project_app" },
  { appKey: "crm", title: "CRM", singularName: "CRM", kind: "GROUP" as const, viewType: "group_app" },
  { appKey: "passwords", title: "Passwords", singularName: "Password", kind: "GROUP" as const, viewType: "group_app" },
  { appKey: "invoices", title: "Invoices+", singularName: "Invoice", kind: "GROUP" as const, viewType: "group_app" },
];

/** Idempotently seed the application catalog. Safe to call on every registration. */
export async function seedDefaultApplications(db: Db): Promise<void> {
  for (const app of APPLICATIONS) {
    await db.application.upsert({
      where: { appKey: app.appKey },
      update: {},
      create: app,
    });
  }
}

/** Create the starter group, project, task list and installed project apps. */
export async function seedStarterWorkspace(
  db: Db,
  companyId: number,
  userId: number
): Promise<void> {
  const group = await db.projectGroup.create({
    data: {
      companyId,
      name: "General Projects",
      uniqueName: "general-projects",
      ownerId: userId,
    },
  });

  const project = await db.project.create({
    data: {
      groupId: group.id,
      name: "My First Project",
      uniqueName: "my-first-project",
      ownerId: userId,
    },
  });

  await db.projectMember.create({ data: { projectId: project.id, userId, role: "OWNER" } });
  await db.taskList.create({
    data: { projectId: project.id, name: "All Tasks List", order: 0 },
  });

  const projectApps = await db.application.findMany({
    where: { kind: "PROJECT", appKey: { in: ["tasks", "discussions", "files", "calendar"] } },
    select: { id: true },
  });
  for (const app of projectApps) {
    await db.projectApplication.create({
      data: { projectId: project.id, applicationId: app.id },
    });
  }
}
