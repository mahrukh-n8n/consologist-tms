import { describe, expect, it, vi } from "vitest";
import { gkUpdateTaskStatus } from "./tasks";
import { TaskStatus } from "@/generated/prisma/enums";

function txFor(current: TaskStatus) {
  const create = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockImplementation(({ data }) => ({ id: 7, ...data }));
  return {
    tx: {
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: 7, status: current }),
        update,
      },
      auditLog: { create },
    } as never,
    update,
    create,
  };
}

describe("task status gatekeeper", () => {
  it("completes a task and writes audit", async () => {
    const { tx, update, create } = txFor(TaskStatus.IN_PROGRESS);
    const result = await gkUpdateTaskStatus(tx, 1, 9, { taskId: 7, status: TaskStatus.COMPLETED });
    expect(result).toMatchObject({ status: TaskStatus.COMPLETED, progress: 100 });
    expect(update).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ oldValues: { status: TaskStatus.IN_PROGRESS } }),
    }));
  });

  it("rejects a missing task", async () => {
    const { tx } = txFor(TaskStatus.NO_PROGRESS);
    (tx as unknown as { task: { findFirst: ReturnType<typeof vi.fn> } }).task.findFirst.mockResolvedValue(null);
    await expect(gkUpdateTaskStatus(tx, 1, 9, { taskId: 7, status: TaskStatus.COMPLETED }))
      .rejects.toThrow(/not found/i);
  });
});
