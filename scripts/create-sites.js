// Create two sites with 26 plots each via API
const BASE = "http://localhost:3002";

const templates = {
  willow: "cmmqnozjw0000ph2kemxws1rn",    // 2-Bed Starter Home
  oakwood: "cmmqp271m001zph2kiz98f4um",    // Semi-Detached 3-Bed
  briarwood: "cmmqrm8hn000ephc4gqahyrzd",  // Detached 4-Bed
  riverside: "cmmqw30x30088phc47t3spibn",   // Apartment 2-Bed
};

const johnHudson = "cmmjc96w00001phk4bqnotf4w";
const andyRoberts = "cmmjc972p0003phk4ih95nhkv";

// 26 plots per site — mixed house types in groups, offset by 1 week
// Group 1 (Plots 1-6): Semi-Detached 3-Bed (Oakwood)
// Group 2 (Plots 7-12): Detached 4-Bed (Briarwood)
// Group 3 (Plots 13-18): 2-Bed Starter Home (Willow)
// Group 4 (Plots 19-24): Apartment 2-Bed (Riverside)
// Group 5 (Plots 25-26): Detached 4-Bed (Briarwood) — final pair

const plotGroups = [
  { start: 1, end: 6, template: templates.oakwood, weekOffset: 0 },
  { start: 7, end: 12, template: templates.briarwood, weekOffset: 2 },
  { start: 13, end: 18, template: templates.willow, weekOffset: 4 },
  { start: 19, end: 24, template: templates.riverside, weekOffset: 6 },
  { start: 25, end: 26, template: templates.briarwood, weekOffset: 8 },
];

const sites = [
  {
    name: "Ry's Site",
    description: "New-build residential development in Didsbury, Manchester",
    location: "Didsbury, Manchester",
    address: "Wilmslow Road, Didsbury M20 5PG",
    postcode: "M20 5PG",
    assignedToId: johnHudson,
    baseStart: "2026-04-20", // Monday
  },
  {
    name: "Doc's Site",
    description: "Mixed housing development in Prestbury, Cheshire",
    location: "Prestbury, Cheshire",
    address: "New Hey Road, Prestbury SK10 4DT",
    postcode: "SK10 4DT",
    assignedToId: andyRoberts,
    baseStart: "2026-04-27", // Monday, 1 week after Ry's
  },
];

async function apiFetch(path, options) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: globalCookie },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

let globalCookie = "";

async function login() {
  // Get CSRF token
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  const cookies = csrfRes.headers.getSetCookie?.() || [];
  const csrfData = await csrfRes.json();

  globalCookie = cookies.join("; ");

  // Login
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: globalCookie },
    body: `csrfToken=${csrfData.csrfToken}&email=ross@sightmanager.com&password=Admin1234!`,
    redirect: "manual",
  });

  const loginCookies = loginRes.headers.getSetCookie?.() || [];
  globalCookie = [...cookies, ...loginCookies].join("; ");

  // Get session to verify
  const sessionRes = await fetch(BASE + "/api/auth/session", {
    headers: { Cookie: globalCookie },
  });
  const session = await sessionRes.json();
  const sessionCookies = sessionRes.headers.getSetCookie?.() || [];
  if (sessionCookies.length) globalCookie = [...cookies, ...loginCookies, ...sessionCookies].join("; ");

  console.log("Logged in as:", session.user?.name || "unknown");
  return session;
}

function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

async function createSite(siteConfig) {
  console.log("\n=== Creating " + siteConfig.name + " ===");

  // Create site
  const site = await apiFetch("/api/sites", {
    method: "POST",
    body: JSON.stringify({
      name: siteConfig.name,
      description: siteConfig.description,
      location: siteConfig.location,
      address: siteConfig.address,
      postcode: siteConfig.postcode,
      assignedToId: siteConfig.assignedToId,
    }),
  });
  console.log("Site created:", site.id);

  // Create plots in groups
  for (const group of plotGroups) {
    const startDate = addWeeks(siteConfig.baseStart, group.weekOffset);
    const plots = [];
    for (let i = group.start; i <= group.end; i++) {
      plots.push({ plotName: "Plot " + i, plotNumber: String(i) });
    }

    console.log(
      "  Creating plots " + group.start + "-" + group.end +
      " (start: " + startDate + ", " + plots.length + " plots)"
    );

    const result = await apiFetch("/api/plots/apply-template-batch", {
      method: "POST",
      body: JSON.stringify({
        siteId: site.id,
        templateId: group.template,
        startDate,
        plots,
        supplierMappings: {},
      }),
    });

    console.log("  Created " + result.created + " plots" + (result.errors?.length ? " (" + result.errors.length + " errors)" : ""));
  }

  return site;
}

async function main() {
  await login();

  for (const siteConfig of sites) {
    const site = await createSite(siteConfig);

    // Verify
    const siteData = await apiFetch("/api/sites/" + site.id, { method: "GET" });
    const totalJobs = siteData.plots.reduce((s, p) => s + p.jobs.length, 0);
    console.log("  Verified: " + siteData.plots.length + " plots, " + totalJobs + " jobs, manager: " + (siteData.assignedTo?.name || "none"));
  }

  console.log("\nDone!");
}

main().catch(console.error);
