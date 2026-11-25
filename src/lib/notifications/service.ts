"use server";

import { prisma } from "@/lib/db";

/** Notification types with associated severity/color */
type NotificationType = "info" | "warning" | "error" | "success";

/** Data needed to create a notification */
interface CreateNotificationInput {
  companyId: number;
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
}

/** Serialized notification for the client */
interface NotificationData {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Create a new notification for a user.
 *
 * @param input - Notification data
 * @returns The created notification ID
 */
async function createNotification(input: CreateNotificationInput): Promise<number> {
  const notification = await prisma.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
    },
  });
  return notification.id;
}

/**
 * Create notifications for multiple users at once.
 * Useful for broadcasting alerts to a team.
 */
async function createBulkNotifications(
  companyId: number,
  userIds: number[],
  title: string,
  message: string,
  type: NotificationType
): Promise<number> {
  const data = userIds.map((userId) => ({
    companyId,
    userId,
    title,
    message,
    type,
  }));

  const result = await prisma.notification.createMany({ data });
  return result.count;
}

/**
 * Get the count of unread notifications for a user in a company.
 */
async function getUnreadCount(userId: number, companyId: number): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      companyId,
      isRead: false,
    },
  });
}

/**
 * Fetch recent notifications for a user (for the dropdown panel).
 *
 * @param userId - The user ID
 * @param companyId - The company ID
 * @param limit - Max number of notifications to return
 * @returns Recent notifications sorted by creation date
 */
async function getRecentNotifications(
  userId: number,
  companyId: number,
  limit: number = 10
): Promise<NotificationData[]> {
  const notifications = await prisma.notification.findMany({
    where: { userId, companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return notifications.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));
}

/**
 * Fetch paginated notifications for the full notifications page.
 */
async function getPaginatedNotifications(
  userId: number,
  companyId: number,
  params: {
    page?: number;
    limit?: number;
    type?: string;
    unreadOnly?: boolean;
  } = {}
): Promise<{
  notifications: NotificationData[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { userId, companyId };
  if (params.type) where.type = params.type;
  if (params.unreadOnly) where.isRead = false;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Mark a single notification as read.
 */
async function markAsRead(
  notificationId: number,
  userId: number,
  companyId: number
): Promise<boolean> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId, companyId },
  });

  if (!notification) return false;

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return true;
}

/**
 * Mark all notifications as read for a user in a company.
 */
async function markAllAsRead(userId: number, companyId: number): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, companyId, isRead: false },
    data: { isRead: true },
  });
  return result.count;
}

export {
  createNotification,
  createBulkNotifications,
  getUnreadCount,
  getRecentNotifications,
  getPaginatedNotifications,
  markAsRead,
  markAllAsRead,
};
