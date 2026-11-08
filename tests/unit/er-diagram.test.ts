import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { erDiagram, parseSchema } from "../../scripts/er-diagram.mjs";

describe("ER diagram", () => {
  it("matches the Prisma schema; run `npm run docs:diagrams` if this fails", () => {
    expect(readFileSync("docs/diagrams/er-diagram.mmd", "utf8").replaceAll("\r\n", "\n")).toBe(
      erDiagram(),
    );
  });

  it("has every table and marks foreign keys", () => {
    const models = parseSchema(readFileSync("prisma/schema.prisma", "utf8"));
    expect(models).toHaveLength(17);
    const registrations = models.find((m) => m.table === "registrations")!;
    expect(registrations.relations.map((r) => r.target)).toContain("Event");
    expect(registrations.columns.find((c) => c.name === "event_id")!.key).toBe("FK");
  });
});
