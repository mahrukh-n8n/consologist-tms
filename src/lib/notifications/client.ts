"use client";
import { toast } from "sonner";

/** Shared action feedback. Reuse an action ID to replace its previous notice. */
export class NotificationService {
  success(title: string, description?: string, id = title) {
    return toast.success(title, { id, description, duration: 5000 });
  }
  error(title: string, description?: string, id = title) {
    return toast.error(title, { id, description, duration: Infinity });
  }
  warning(title: string, description?: string, id = title) {
    return toast.warning(title, { id, description, duration: Infinity });
  }
  info(title: string, description?: string, id = title) {
    return toast.info(title, { id, description, duration: 7000 });
  }
  async run<T extends { success?: boolean; error?: string | null }>(title: string, action: () => Promise<T>, id = title): Promise<T | { success: false; error: string }> {
    try {
      const result = await action();
      if (result.success) this.success(title, undefined, id);
      else this.error(title, result.error ?? "The action could not be completed.", id);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The action could not be completed.";
      this.error(title, message, id);
      return { success: false, error: message };
    }
  }
  dismiss(id?: string | number) {
    toast.dismiss(id);
  }
}
export const notify = new NotificationService();
