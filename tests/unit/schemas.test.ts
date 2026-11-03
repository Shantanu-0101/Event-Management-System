import { describe, expect, it } from "vitest";
import { categorySchema, profileSchema, signupSchema, slugify } from "@/lib/schemas";

const signup = {
  name: "Asha Patil",
  email: "  Asha.Patil@College.EDU ",
  rollNo: "cs-21-045",
  departmentId: "dep1",
  year: "3",
  password: "long-enough",
  confirmPassword: "long-enough",
};

describe("signupSchema", () => {
  it("normalises email and roll number", () => {
    const r = signupSchema.parse(signup);
    expect(r.email).toBe("asha.patil@college.edu");
    expect(r.rollNo).toBe("CS-21-045");
    expect(r.year).toBe(3);
  });

  it("rejects mismatched passwords on the confirm field", () => {
    const r = signupSchema.safeParse({ ...signup, confirmPassword: "different" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("rejects short passwords and a year outside 1–4", () => {
    expect(
      signupSchema.safeParse({ ...signup, password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    expect(signupSchema.safeParse({ ...signup, year: "5" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("treats empty optional fields as not given", () => {
    const r = profileSchema.parse({ name: "Asha", phone: "", year: "", rollNo: "" });
    expect(r).toEqual({ name: "Asha" });
  });

  it("accepts Indian mobile numbers with spaces or +91", () => {
    expect(profileSchema.parse({ name: "Asha", phone: "+91 98765 43210" }).phone).toBe(
      "+919876543210",
    );
    expect(profileSchema.safeParse({ name: "Asha", phone: "12345" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("reads an unticked checkbox as hidden", () => {
    expect(categorySchema.parse({ name: "Sports" }).isActive).toBe(false);
    expect(categorySchema.parse({ name: "Sports", isActive: "on" }).isActive).toBe(true);
  });
});

describe("slugify", () => {
  it("makes web addresses from names", () => {
    expect(slugify("Paper Presentation")).toBe("paper-presentation");
    expect(slugify("  Art & Craft!! ")).toBe("art-craft");
  });
});
