import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

// Contractor IDs from the database
const C = {
  groundworks: "cmmjc97oc000ephk4w8qgv9vq",  // Steve Baker / Baker Groundworks
  bricklaying: "cmmjuccaq0009phl4wa8cdq8r",  // Tom Bradley / Bradley Bricklaying
  roofing:     "cmmjuccbd000aphl403nof797",  // Dan Matthews / Peak Roofing Services
  electrical:  "cmmjuccbz000bphl401ekopjv",  // Chris Walker / Walker Electrical Ltd
  plumbing:    "cmmjucccl000cphl4kiu6zmt4",  // James Patel / Patel Plumbing & Heating
  plastering:  "cmmjuccd7000dphl433lmf2qy",  // Sean Murphy / Murphy Plastering
  carpentry:   "cmmjuccds000ephl4rbg38d0t",  // Alan Cooper / Cooper Carpentry & Joinery
  kitchen:     "cmmjuccef000fphl4knxiq5d5",  // Lisa Chen / Chen Kitchen Installations
  decorating:  "cmmjuccez000gphl43gx6krym",  // Mark Roberts / Roberts Decorating
  landscapes:  "cmmjuccfn000hphl4dlolho2t",  // Wayne Fisher / Fisher Landscapes
};

function resolveJob(name, parentName) {
  const n = name.toLowerCase();
  const par = (parentName ?? "").toLowerCase();

  // Groundworks
  if (n.includes("groundwork"))          return { contactId: C.groundworks, weatherAffected: true,  weatherAffectedType: "RAIN",        description: "Bulk earthworks, site clearance and reduced level dig. Coordinate with drainage and foundations." };
  if (n.includes("excavat") || n.includes("reduced level")) return { contactId: C.groundworks, weatherAffected: true, weatherAffectedType: "RAIN", description: "Excavation to formation level and reduced level dig. Dispose of or store surplus spoil as directed." };
  if (n.includes("foundation") || n.includes("concrete foundation")) return { contactId: C.groundworks, weatherAffected: true, weatherAffectedType: "BOTH", description: "Concrete strip or trench foundations. Minimum 3 degrees C for pour. Protect from frost and heavy rain while curing." };
  if (n.includes("damp proof") || n.includes("dpc")) return { contactId: C.groundworks, weatherAffected: false, weatherAffectedType: null, description: "Apply damp proof course membrane at base of brickwork. Lap and seal all joints." };
  if (n.includes("oversite") || n.includes("floor slab") || n.includes("beam block")) return { contactId: C.groundworks, weatherAffected: true, weatherAffectedType: "TEMPERATURE", description: "Oversite concrete or beam and block floor installation. Minimum 3 degrees C. Protect from frost during cure." };
  if (n.includes("drainage below") || n === "drainage") return { contactId: C.groundworks, weatherAffected: true, weatherAffectedType: "RAIN", description: "Below-ground drainage including inspection chambers, gullies and connections to mains sewer." };
  if (n.includes("brickwork to dpc")) return { contactId: C.bricklaying, weatherAffected: true, weatherAffectedType: "BOTH", description: "Brickwork construction from foundation level to DPC height." };

  // Brickwork / Masonry
  if (n.includes("brickwork") || n.includes("blockwork") || n.includes("gable") || n.includes("chimney")) return { contactId: C.bricklaying, weatherAffected: true, weatherAffectedType: "BOTH", description: "Masonry construction. Protect mortar joints from frost (below 2 degrees C) and heavy rain during cure." };

  // Windows & External Doors
  if (n.includes("window") || n.includes("external door")) return { contactId: C.carpentry, weatherAffected: false, weatherAffectedType: null, description: "Supply and fit windows and external door frames. Ensure all frames are plumb, level and fully sealed." };

  // Roofing — Tiling under roofing context
  if (n.includes("roof truss") || n.includes("roof structure") || n.includes("sarking") || n.includes("felt")) return { contactId: C.roofing, weatherAffected: true, weatherAffectedType: "RAIN", description: "Erect roof trusses, fix sarking felt and battens. Structure must be weathertight before First Fix commences." };
  if (n === "tiling" && (par.includes("roof") || par === "")) return { contactId: C.roofing, weatherAffected: true, weatherAffectedType: "RAIN", description: "Fix roof tiles, ridge and hip tiles. All penetrations to be sealed. Valleys and abutments to be lead flashed." };
  if (n.includes("tile & ridge") || n.includes("tile and ridge")) return { contactId: C.roofing, weatherAffected: true, weatherAffectedType: "RAIN", description: "Fix roof tiles, ridge and hip tiles. All penetrations to be sealed. Valleys and abutments to be lead flashed." };
  if (n.includes("roof")) return { contactId: C.roofing, weatherAffected: true, weatherAffectedType: "RAIN", description: "Roofing works including structure and weatherproofing. Must be complete and weathertight before First Fix." };

  // Electrical
  if (n.includes("electrical first fix") || n === "first fix electrical") return { contactId: C.electrical, weatherAffected: false, weatherAffectedType: null, description: "First fix wiring routes, back-boxes, consumer unit position, and distribution board. Complete before plastering." };
  if (n.includes("electrical second fix") || n === "second fix electrical") return { contactId: C.electrical, weatherAffected: false, weatherAffectedType: null, description: "Second fix electrical including sockets, switches, light fittings and consumer unit commissioning." };
  if (n.includes("electrical") || n.includes("mvhr") || n.includes("ventilation")) return { contactId: C.electrical, weatherAffected: false, weatherAffectedType: null, description: "Electrical installation and mechanical ventilation. Coordinate with plumbing and carpentry trades." };

  // Plumbing / Heating / Gas
  if (n.includes("plumbing first fix") || n === "first fix plumbing") return { contactId: C.plumbing, weatherAffected: false, weatherAffectedType: null, description: "First fix plumbing including soil stack, pipework routes, and bathroom rough-in. Complete before plastering." };
  if (n.includes("plumbing second fix") || n === "second fix plumbing") return { contactId: C.plumbing, weatherAffected: false, weatherAffectedType: null, description: "Second fix plumbing including sanitaryware connections, radiators, and boiler commissioning." };
  if (n.includes("plumbing") || n.includes("heating") || n.includes("gas")) return { contactId: C.plumbing, weatherAffected: false, weatherAffectedType: null, description: "Plumbing, heating, and gas installation. Coordinate with electrical and plastering trades." };

  // Joinery / Carpentry / Framing
  if (n.includes("joinery") || n.includes("carpentry") || n.includes("partition") || n.includes("framing") || n.includes("stud wall") || n.includes("door opening") || n.includes("lintel")) return { contactId: C.carpentry, weatherAffected: false, weatherAffectedType: null, description: "Carpentry and joinery works. Coordinate with electrical and plumbing first fix trades." };

  // Plastering / Screeding
  if (n.includes("plasterboard") || n.includes("skim")) return { contactId: C.plastering, weatherAffected: false, weatherAffectedType: null, description: "Plasterboard fixing and skim coat finishing. Minimum 5 degrees C. Allow full drying time before decoration." };
  if (n.includes("floor screed") || n.includes("screeding")) return { contactId: C.plastering, weatherAffected: true, weatherAffectedType: "TEMPERATURE", description: "Floor screed application. Minimum 5 degrees C. Protect from frost. Allow at least 1mm per day drying time." };
  if (n.includes("plaster") && !n.includes("board")) return { contactId: C.plastering, weatherAffected: true, weatherAffectedType: "TEMPERATURE", description: "Plaster application to walls and ceilings. Minimum 5 degrees C required. Protect from frost during cure." };

  // Kitchen
  if (n.includes("kitchen")) return { contactId: C.kitchen, weatherAffected: false, weatherAffectedType: null, description: "Kitchen unit installation, worktops, and integrated appliances. Coordinate with electrical and plumbing second fix." };

  // Bathroom / Tiling in wet room context
  if (n.includes("bathroom")) return { contactId: C.kitchen, weatherAffected: false, weatherAffectedType: null, description: "Bathroom sanitaryware installation, shower enclosures, and accessories. Coordinate with plumbing second fix." };
  if (n === "tiling" && (par.includes("kitchen") || par.includes("bathroom"))) return { contactId: C.kitchen, weatherAffected: false, weatherAffectedType: null, description: "Wall and floor tiling to wet rooms, kitchen splashbacks, and utility areas." };

  // Decoration
  if (n.includes("decor") || n.includes("paint") || n.includes("floor cover") || n.includes("ironmong")) return { contactId: C.decorating, weatherAffected: false, weatherAffectedType: null, description: "Interior decoration, floor finishes, and final accessories. All surfaces must be fully dry before commencing." };

  // Externals / Landscaping
  if (n.includes("landscap")) return { contactId: C.landscapes, weatherAffected: true, weatherAffectedType: "RAIN", description: "Soft landscaping, planting, turfing, and boundary treatments. Work in dry conditions where possible." };
  if (n.includes("driveway") || n.includes("path") || n.includes("external work")) return { contactId: C.landscapes, weatherAffected: true, weatherAffectedType: "RAIN", description: "Hard landscaping including driveways, paths, and paving. Avoid laying in wet or frosty conditions." };

  // Snagging / Handover
  if (n.includes("snag") || n.includes("handover") || n.includes("remedial") || n.includes("final clean")) return { contactId: null, weatherAffected: false, weatherAffectedType: null, description: "Inspect all works against specification. Raise and resolve all snagging items before formal handover." };

  // Generic parent stages
  if (n === "first fix m&e" || n === "first fix m & e") return { contactId: null, weatherAffected: false, weatherAffectedType: null, description: "First fix mechanical and electrical stage covering plumbing, electrical, and ventilation rough-in." };
  if (n === "first fix")          return { contactId: null, weatherAffected: false, weatherAffectedType: null, description: "First fix stage covering electrical, plumbing, and joinery rough-in. Complete before plastering commences." };
  if (n === "second fix")         return { contactId: null, weatherAffected: false, weatherAffectedType: null, description: "Second fix stage covering electrical, plumbing, and joinery completion works." };
  if (n === "snagging & handover") return { contactId: null, weatherAffected: false, weatherAffectedType: null, description: "Final inspection and resolution of all snagging items before customer handover." };
  if (n === "externals")          return { contactId: C.landscapes, weatherAffected: true, weatherAffectedType: "RAIN", description: "All external hard and soft landscaping works including driveways, paths, and gardens." };
  if (n === "plastering & screeding") return { contactId: C.plastering, weatherAffected: true, weatherAffectedType: "TEMPERATURE", description: "Plasterboard, skim, and floor screed works. Minimum 5 degrees C required throughout cure period." };
  if (n === "decoration & finishes") return { contactId: C.decorating, weatherAffected: false, weatherAffectedType: null, description: "Interior decoration, floor coverings, and finishing accessories." };
  if (n === "kitchen & bathroom" || n === "kitchen & bathrooms") return { contactId: C.kitchen, weatherAffected: false, weatherAffectedType: null, description: "Kitchen and bathroom fit-out including units, sanitaryware, and tiling." };
  if (n === "externals & snagging") return { contactId: C.landscapes, weatherAffected: true, weatherAffectedType: "RAIN", description: "External landscaping works followed by final snagging inspection and handover." };

  return null;
}

async function run() {
  const jobs = await p.templateJob.findMany({
    include: { parent: { select: { name: true } } },
  });

  console.log("Total template jobs:", jobs.length);
  let updated = 0;
  const skipped = [];

  for (const job of jobs) {
    const parentName = job.parent?.name ?? null;
    const resolved = resolveJob(job.name, parentName);
    if (!resolved) {
      skipped.push(`${job.name} (parent: ${parentName})`);
      continue;
    }
    await p.templateJob.update({
      where: { id: job.id },
      data: {
        contactId: resolved.contactId,
        weatherAffected: resolved.weatherAffected,
        weatherAffectedType: resolved.weatherAffectedType,
        description: resolved.description,
      },
    });
    updated++;
  }

  if (skipped.length > 0) {
    console.log("No rule matched for:", skipped.join(", "));
  }
  console.log(`Done. Updated: ${updated}, Skipped: ${skipped.length}`);
}

run().catch(console.error).finally(() => p.$disconnect());
