import { forbidden } from "next/navigation";

// The proxy rewrites wrong-role requests here. This page is pre-rendered at build time, and
// serving a saved page uses the status saved with it, not the one the proxy asked for. So it
// calls forbidden() rather than showing the same content: that saves 403 as its status.
export default function ForbiddenPage() {
  forbidden();
}
