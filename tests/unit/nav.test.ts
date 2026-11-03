import { describe, expect, it } from "vitest";
import { getNavItems } from "@/lib/nav";

const hrefs = (role: Parameters<typeof getNavItems>[0]) => getNavItems(role).map((i) => i.href);

describe("getNavItems", () => {
  it("shows visitors only public pages", () => {
    expect(hrefs(null)).toEqual(["/", "/events"]);
  });

  it("never shows management pages to students", () => {
    expect(hrefs("STUDENT").some((h) => h.startsWith("/manage"))).toBe(false);
  });

  it("gives coordinators check-in but not user management", () => {
    expect(hrefs("COORDINATOR")).toContain("/manage/check-in");
    expect(hrefs("COORDINATOR")).not.toContain("/manage/users");
  });

  it("gives admins user management and reports", () => {
    expect(hrefs("ADMIN")).toEqual(expect.arrayContaining(["/manage/users", "/manage/reports"]));
  });
});
