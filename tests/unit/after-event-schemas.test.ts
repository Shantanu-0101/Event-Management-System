import { describe, expect, it } from "vitest";
import { announcementSchema, feedbackSchema } from "@/lib/schemas";

describe("feedbackSchema", () => {
  it("accepts ratings from 1 to 5 and treats an empty comment as none", () => {
    expect(feedbackSchema.parse({ rating: "5", comment: "  " })).toEqual({ rating: 5 });
    expect(feedbackSchema.parse({ rating: "1", comment: " Good " })).toEqual({
      rating: 1,
      comment: "Good",
    });
  });
  it.each(["0", "6", "2.5", "", null, "x"])("refuses a rating of %s", (rating) => {
    expect(feedbackSchema.safeParse({ rating }).success).toBe(false);
  });
  it("refuses a comment over 1000 characters", () => {
    expect(feedbackSchema.safeParse({ rating: 3, comment: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("announcementSchema", () => {
  it("trims the subject and message", () => {
    expect(announcementSchema.parse({ subject: " Room change ", body: " Go to B12 " })).toEqual({
      subject: "Room change",
      body: "Go to B12",
    });
  });
  it("refuses blank or oversized messages", () => {
    expect(announcementSchema.safeParse({ subject: "  ", body: "Hello" }).success).toBe(false);
    expect(announcementSchema.safeParse({ subject: "Hello", body: "" }).success).toBe(false);
    expect(announcementSchema.safeParse({ subject: "x".repeat(121), body: "Hello" }).success).toBe(
      false,
    );
    expect(announcementSchema.safeParse({ subject: "Hello", body: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});
