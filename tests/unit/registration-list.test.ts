import { describe, expect, it } from "vitest";
import {
  exportTable,
  filterQuery,
  parseRegistrationFilters,
  toCsv,
  type RegistrationRow,
} from "@/lib/registration-list";

const row: RegistrationRow = {
  id: "r1",
  name: "Priya Sharma",
  rollNo: "CS101",
  email: "priya@test.local",
  phone: "+91 98765 43210",
  department: "CSE",
  year: 3,
  team: null,
  status: "CONFIRMED",
  waitlistPlace: null,
  registeredAt: new Date("2026-11-01T04:30:00Z"),
  checkedInAt: new Date("2026-11-10T04:30:00Z"),
  checkedInBy: "Coordinator",
};

describe("parseRegistrationFilters", () => {
  it("defaults to everyone holding a place", () => {
    expect(parseRegistrationFilters({})).toEqual({
      q: "",
      status: "ACTIVE",
      attendance: "ALL",
      department: "",
      year: undefined,
    });
  });

  it("reads valid filters", () => {
    const filters = parseRegistrationFilters({
      q: " priya ",
      status: "WAITLISTED",
      attendance: "CHECKED_IN",
      department: "d1",
      year: "2",
    });
    expect(filters).toEqual({
      q: "priya",
      status: "WAITLISTED",
      attendance: "CHECKED_IN",
      department: "d1",
      year: 2,
    });
  });

  it("ignores nonsense in the address rather than failing", () => {
    const filters = parseRegistrationFilters({
      q: ["a", "b"],
      status: "HACKED",
      attendance: 7,
      year: "abc",
    });
    expect(filters).toMatchObject({ q: "", status: "ACTIVE", attendance: "ALL", year: undefined });
  });
});

describe("filterQuery", () => {
  it("leaves defaults out, so a plain page has a plain address", () => {
    expect(filterQuery(parseRegistrationFilters({})).toString()).toBe("");
  });

  it("round-trips through the address", () => {
    const filters = parseRegistrationFilters({ q: "a b", status: "CANCELLED", year: "4" });
    const query = Object.fromEntries(filterQuery(filters));
    expect(parseRegistrationFilters(query)).toEqual(filters);
  });
});

describe("exportTable", () => {
  it("has one header and one row per person, in India time", () => {
    const [header, first] = exportTable([row]);
    expect(first).toHaveLength(header.length);
    expect(first[header.indexOf("Name")]).toBe("Priya Sharma");
    expect(first[header.indexOf("Status")]).toBe("Registered");
    expect(first[header.indexOf("Checked in at")]).toMatch(/^Tue, 10 Nov,? 2026, 10:00 am$/);
  });

  it("never includes the ticket code", () => {
    const table = exportTable([{ ...row, ticketCode: "SECRETCODE" } as RegistrationRow]);
    expect(JSON.stringify(table)).not.toContain("SECRETCODE");
    expect(table[0].join(" ").toLowerCase()).not.toContain("ticket");
  });
});

describe("toCsv", () => {
  it("starts with a byte order mark so Excel reads UTF-8, and ends each line with CRLF", () => {
    const csv = toCsv([["नाव"], ["प्रिया"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿नाव\r\nप्रिया\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines"]])).toBe('﻿"a,b","say ""hi""","two\nlines"\r\n');
  });

  it("leaves empty cells empty and numbers alone", () => {
    expect(toCsv([[null, 3, 0]])).toBe("﻿,3,0\r\n");
  });

  it("stops a student's name from running as a spreadsheet formula", () => {
    for (const attack of ['=HYPERLINK("http://evil","x")', "+cmd|calc", "-2+3", "@SUM(A1)"]) {
      const cell = toCsv([[attack]]).slice(1);
      expect(cell.replace(/^"/, "")).toMatch(/^'/);
    }
  });

  it("keeps ordinary phone numbers as they are", () => {
    expect(toCsv([["+91 98765 43210"]])).toBe("﻿+91 98765 43210\r\n");
  });
});
