import { describe, expect, it } from "vitest";
import { allowedRoles, safeNextPath } from "@/lib/access";
import { getNavItems } from "@/lib/nav";
import type { Role } from "@/generated/prisma/enums";

describe("allowedRoles", () => {
  it("leaves public pages open", () => {
    expect(allowedRoles("/")).toBeNull();
    expect(allowedRoles("/events")).toBeNull();
    expect(allowedRoles("/login")).toBeNull();
  });

  it("keeps admin pages for admins only", () => {
    for (const path of ["/manage/users", "/manage/users/x", "/manage/categories/abc"]) {
      expect(allowedRoles(path)).toEqual(["ADMIN"]);
    }
  });

  it("lets coordinators into the rest of /manage", () => {
    expect(allowedRoles("/manage/check-in")).toEqual(["COORDINATOR", "ADMIN"]);
    expect(allowedRoles("/manage/events")).toEqual(["COORDINATOR", "ADMIN"]);
    expect(allowedRoles("/manage/events/abc")).toEqual(["COORDINATOR", "ADMIN"]);
  });

  it("keeps creating events for admins only", () => {
    expect(allowedRoles("/manage/events/new")).toEqual(["ADMIN"]);
  });

  it("leaves event pages public", () => {
    expect(allowedRoles("/events/annual-hackathon")).toBeNull();
    expect(allowedRoles("/events/annual-hackathon/calendar.ics")).toBeNull();
  });

  it("does not match a prefix inside a longer word", () => {
    expect(allowedRoles("/manager")).toBeNull();
    expect(allowedRoles("/profiles")).toBeNull();
  });

  it("allows every nav link a role is shown", () => {
    const roles: Role[] = ["STUDENT", "COORDINATOR", "ADMIN"];
    for (const role of roles) {
      for (const item of getNavItems(role)) {
        const allowed = allowedRoles(item.href);
        expect(allowed === null || allowed.includes(role), `${role} → ${item.href}`).toBe(true);
      }
    }
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/manage/users?q=a")).toBe("/manage/users?q=a");
  });

  it("refuses other sites and odd values", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "", undefined, 42]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("does not send people back to the login page", () => {
    expect(safeNextPath("/login")).toBe("/");
  });
});
