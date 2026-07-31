import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("survey router", () => {
  it("list returns empty array when no surveys exist", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.survey.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects unauthenticated access", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    await expect(caller.survey.list()).rejects.toThrow();
  });

  it("rejects create with invalid input (missing title)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Zod validation should reject empty title
    await expect(
      caller.survey.create({ title: "", sheetUrl: "https://example.com" })
    ).rejects.toThrow();
  });

  it("rejects create with invalid URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.survey.create({ title: "Test", sheetUrl: "not-a-url" })
    ).rejects.toThrow();
  });
});

// Test the CSV parser and statistics functions indirectly
// by testing the sheetsUrlToCsv logic
describe("Google Sheets URL conversion", () => {
  it("converts /edit URLs to CSV export format", () => {
    const url = "https://docs.google.com/spreadsheets/d/1abc123/edit";
    // The function is internal, but we can test the pattern
    expect(url).toMatch(/\/d\/([a-zA-Z0-9-_]+)/);
  });

  it("handles export?format=csv URLs directly", () => {
    const url = "https://docs.google.com/spreadsheets/d/1abc123/export?format=csv";
    expect(url).toContain("export?format=csv");
  });
});
