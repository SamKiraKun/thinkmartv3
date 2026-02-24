/* eslint-disable no-console */
const DEFAULT_BASE_URL = "http://localhost:3000";
const baseUrl = (process.env.E2E_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

const checks = [
  { path: "/", allowedStatuses: [200] },
  { path: "/auth/login", allowedStatuses: [200] },
  // Auth-protected route should at least respond; redirect to login is acceptable in smoke mode.
  { path: "/dashboard/user", allowedStatuses: [200, 301, 302, 303, 307, 308] },
];

async function run() {
  console.log(`[e2e:smoke] Base URL: ${baseUrl}`);
  const failures = [];

  for (const check of checks) {
    const url = `${baseUrl}${check.path}`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const ok = check.allowedStatuses.includes(res.status);
      console.log(`[e2e:smoke] ${res.status} ${check.path}`);
      if (!ok) {
        failures.push(`${check.path} returned ${res.status}`);
      }
    } catch (error) {
      failures.push(`${check.path} request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error("[e2e:smoke] Failures:");
    failures.forEach((line) => console.error(`- ${line}`));
    process.exit(1);
  }

  console.log("[e2e:smoke] All checks passed.");
}

run();
