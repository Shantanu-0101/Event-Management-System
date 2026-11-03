import type { Metadata } from "next";
import Forbidden from "@/app/forbidden";

// The proxy rewrites wrong-role requests here with status 403.
export const metadata: Metadata = { title: "No access", robots: { index: false } };

export default Forbidden;
