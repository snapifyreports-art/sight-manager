const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const suppliers = await p.supplier.findMany();
  const sup = {};
  for (const s of suppliers) sup[s.name] = s.id;

  const allTemplateJobs = await p.templateJob.findMany({
    include: { orders: true, template: { select: { name: true } } },
  });

  const ordersToCreate = [
    // ===== THE WILLOW (2-Bed Starter Home) =====
    { t: "The Willow", j: "Foundations", s: sup["Jewson"], d: "Ready-mix concrete for strip foundations", o: -2, dl: 2, items: [
      { name: "Ready-mix C25 concrete", quantity: 20, unit: "m\u00B3", unitCost: 95 },
      { name: "Rebar mesh A252", quantity: 8, unit: "sheets", unitCost: 42 },
    ]},
    { t: "The Willow", j: "Damp Proof Course", s: sup["Forterra Building Products"], d: "DPC membrane and blocks", o: -2, dl: 2, items: [
      { name: "DPC membrane 300mm", quantity: 40, unit: "metres", unitCost: 1.20 },
      { name: "Dense concrete blocks 100mm", quantity: 200, unit: "blocks", unitCost: 1.85 },
    ]},
    { t: "The Willow", j: "Drainage", s: sup["Polypipe"], d: "Below-ground drainage", o: -2, dl: 2, items: [
      { name: "110mm PVC-U pipe", quantity: 30, unit: "metres", unitCost: 8.50 },
      { name: "110mm bends & junctions", quantity: 12, unit: "pcs", unitCost: 4.20 },
      { name: "Inspection chamber 450mm", quantity: 2, unit: "pcs", unitCost: 85 },
    ]},
    { t: "The Willow", j: "Oversite", s: sup["Jewson"], d: "Oversite concrete and insulation", o: -2, dl: 2, items: [
      { name: "Oversite concrete C20", quantity: 8, unit: "m\u00B3", unitCost: 90 },
      { name: "Floor insulation 75mm PIR", quantity: 40, unit: "m\u00B2", unitCost: 12 },
      { name: "DPM 1200g polythene", quantity: 1, unit: "roll", unitCost: 65 },
    ]},
    { t: "The Willow", j: "First Fix Electrical", s: sup["Edmundson Electrical"], d: "First fix electrical cabling", o: -2, dl: 2, items: [
      { name: "2.5mm T&E cable", quantity: 3, unit: "100m rolls", unitCost: 65 },
      { name: "1.5mm T&E cable", quantity: 2, unit: "100m rolls", unitCost: 48 },
      { name: "Metal back boxes", quantity: 30, unit: "pcs", unitCost: 1.20 },
      { name: "Consumer unit 10-way", quantity: 1, unit: "unit", unitCost: 125 },
    ]},
    { t: "The Willow", j: "First Fix Plumbing", s: sup["Jewson"], d: "First fix plumbing materials", o: -2, dl: 2, items: [
      { name: "15mm copper pipe", quantity: 40, unit: "metres", unitCost: 4.50 },
      { name: "22mm copper pipe", quantity: 15, unit: "metres", unitCost: 6.80 },
      { name: "Speedfit fittings pack", quantity: 1, unit: "kit", unitCost: 85 },
      { name: "Waste pipes & fittings", quantity: 1, unit: "kit", unitCost: 65 },
    ]},
    { t: "The Willow", j: "First Fix Joinery", s: sup["Jewson"], d: "First fix timber and joists", o: -2, dl: 2, items: [
      { name: "Floor joists 47x200mm", quantity: 20, unit: "lengths", unitCost: 14 },
      { name: "Noggins 47x100mm", quantity: 30, unit: "lengths", unitCost: 4.50 },
    ]},
    { t: "The Willow", j: "Plastering", s: sup["British Gypsum"], d: "Plasterboard and plaster", o: -2, dl: 2, items: [
      { name: "Gyproc WallBoard 2400x1200x12.5mm", quantity: 70, unit: "sheets", unitCost: 8.50 },
      { name: "Thistle Multi-Finish plaster", quantity: 20, unit: "25kg bags", unitCost: 9.80 },
      { name: "Plaster beading", quantity: 40, unit: "lengths", unitCost: 1.50 },
    ]},
    { t: "The Willow", j: "Second Fix Electrical", s: sup["Edmundson Electrical"], d: "Second fix electrical fittings", o: -2, dl: 2, items: [
      { name: "Double sockets white", quantity: 20, unit: "pcs", unitCost: 3.50 },
      { name: "Single switches white", quantity: 12, unit: "pcs", unitCost: 2.80 },
      { name: "Downlights LED", quantity: 18, unit: "pcs", unitCost: 8.50 },
      { name: "Smoke alarms interconnected", quantity: 4, unit: "pcs", unitCost: 22 },
    ]},
    { t: "The Willow", j: "Second Fix Plumbing", s: sup["Travis Perkins"], d: "Sanitaryware and radiators", o: -2, dl: 2, items: [
      { name: "Close-coupled WC pack", quantity: 1, unit: "set", unitCost: 145 },
      { name: "Pedestal basin pack", quantity: 1, unit: "set", unitCost: 95 },
      { name: "Bath 1500mm white", quantity: 1, unit: "bath", unitCost: 120 },
      { name: "Panel radiators (various)", quantity: 6, unit: "pcs", unitCost: 65 },
    ]},
    { t: "The Willow", j: "Second Fix Joinery", s: sup["Jewson"], d: "Internal doors and skirting", o: -2, dl: 2, items: [
      { name: "Internal flush doors", quantity: 6, unit: "doors", unitCost: 35 },
      { name: "Door linings & stops", quantity: 6, unit: "sets", unitCost: 12 },
      { name: "MDF skirting 70mm", quantity: 50, unit: "metres", unitCost: 2.20 },
      { name: "MDF architrave 55mm", quantity: 35, unit: "metres", unitCost: 1.80 },
    ]},
    { t: "The Willow", j: "Decoration", s: sup["Dulux Trade Centre"], d: "Paint and decorating materials", o: -1, dl: 2, items: [
      { name: "Matt emulsion white 5L", quantity: 4, unit: "tins", unitCost: 22 },
      { name: "Vinyl silk white 5L", quantity: 2, unit: "tins", unitCost: 25 },
      { name: "Gloss white 2.5L", quantity: 2, unit: "tins", unitCost: 18 },
    ]},
    { t: "The Willow", j: "External Works", s: sup["Travis Perkins"], d: "External paving and landscaping", o: -2, dl: 3, items: [
      { name: "Block paving 200x100mm", quantity: 25, unit: "m\u00B2", unitCost: 18 },
      { name: "Sharp sand (bedding)", quantity: 3, unit: "tonnes", unitCost: 45 },
      { name: "Lawn turf rolls", quantity: 40, unit: "m\u00B2", unitCost: 4.50 },
      { name: "Fence panels 6x6ft", quantity: 6, unit: "panels", unitCost: 28 },
    ]},

    // ===== THE OAKWOOD (Semi-Detached 3-Bed) =====
    { t: "The Oakwood", j: "Foundations", s: sup["Jewson"], d: "Ready-mix concrete for strip foundations", o: -2, dl: 2, items: [
      { name: "Ready-mix C30 concrete", quantity: 30, unit: "m\u00B3", unitCost: 105 },
      { name: "Rebar mesh A393", quantity: 12, unit: "sheets", unitCost: 48 },
    ]},
    { t: "The Oakwood", j: "Drainage", s: sup["Polypipe"], d: "Below-ground drainage system", o: -2, dl: 2, items: [
      { name: "110mm PVC-U pipe", quantity: 40, unit: "metres", unitCost: 8.50 },
      { name: "110mm bends & junctions", quantity: 18, unit: "pcs", unitCost: 4.20 },
      { name: "Inspection chamber 450mm", quantity: 2, unit: "pcs", unitCost: 85 },
    ]},
    { t: "The Oakwood", j: "Oversite", s: sup["Jewson"], d: "Oversite concrete and floor insulation", o: -2, dl: 2, items: [
      { name: "Oversite concrete C20", quantity: 12, unit: "m\u00B3", unitCost: 90 },
      { name: "Floor insulation 100mm PIR", quantity: 55, unit: "m\u00B2", unitCost: 14 },
      { name: "DPM 1200g polythene", quantity: 2, unit: "rolls", unitCost: 65 },
    ]},
    { t: "The Oakwood", j: "First Fix Electrical", s: sup["Edmundson Electrical"], d: "First fix electrical cabling", o: -2, dl: 2, items: [
      { name: "2.5mm T&E cable", quantity: 4, unit: "100m rolls", unitCost: 65 },
      { name: "1.5mm T&E cable", quantity: 3, unit: "100m rolls", unitCost: 48 },
      { name: "Metal back boxes", quantity: 45, unit: "pcs", unitCost: 1.20 },
      { name: "Consumer unit 14-way", quantity: 1, unit: "unit", unitCost: 155 },
    ]},
    { t: "The Oakwood", j: "First Fix Plumbing", s: sup["Jewson"], d: "First fix plumbing pipework", o: -2, dl: 2, items: [
      { name: "15mm copper pipe", quantity: 60, unit: "metres", unitCost: 4.50 },
      { name: "22mm copper pipe", quantity: 25, unit: "metres", unitCost: 6.80 },
      { name: "Speedfit fittings pack", quantity: 1, unit: "kit", unitCost: 95 },
      { name: "Waste pipes & fittings", quantity: 1, unit: "kit", unitCost: 75 },
    ]},
    { t: "The Oakwood", j: "First Fix Joinery", s: sup["Jewson"], d: "Floor joists and structural timber", o: -2, dl: 2, items: [
      { name: "Floor joists 47x225mm", quantity: 28, unit: "lengths", unitCost: 18 },
      { name: "Noggins & trimmers", quantity: 40, unit: "lengths", unitCost: 4.50 },
    ]},
    { t: "The Oakwood", j: "Plastering", s: sup["British Gypsum"], d: "Plasterboard and finishing plaster", o: -2, dl: 2, items: [
      { name: "Gyproc WallBoard 2400x1200x12.5mm", quantity: 100, unit: "sheets", unitCost: 8.50 },
      { name: "Moisture-resistant board", quantity: 15, unit: "sheets", unitCost: 11 },
      { name: "Thistle Multi-Finish plaster", quantity: 30, unit: "25kg bags", unitCost: 9.80 },
      { name: "Plaster beading", quantity: 55, unit: "lengths", unitCost: 1.50 },
    ]},
    { t: "The Oakwood", j: "Second Fix Electrical", s: sup["Edmundson Electrical"], d: "Second fix electrical fittings", o: -2, dl: 2, items: [
      { name: "Double sockets white", quantity: 28, unit: "pcs", unitCost: 3.50 },
      { name: "Single switches white", quantity: 16, unit: "pcs", unitCost: 2.80 },
      { name: "Downlights LED", quantity: 24, unit: "pcs", unitCost: 8.50 },
      { name: "Smoke alarms interconnected", quantity: 5, unit: "pcs", unitCost: 22 },
    ]},
    { t: "The Oakwood", j: "Second Fix Plumbing", s: sup["Travis Perkins"], d: "Sanitaryware and heating", o: -2, dl: 2, items: [
      { name: "Close-coupled WC pack", quantity: 2, unit: "sets", unitCost: 145 },
      { name: "Pedestal basin pack", quantity: 2, unit: "sets", unitCost: 95 },
      { name: "Bath 1700mm white", quantity: 1, unit: "bath", unitCost: 140 },
      { name: "Panel radiators (various)", quantity: 8, unit: "pcs", unitCost: 65 },
      { name: "Towel rail chrome", quantity: 2, unit: "pcs", unitCost: 55 },
    ]},
    { t: "The Oakwood", j: "Second Fix Joinery", s: sup["Jewson"], d: "Internal doors, skirting, architrave", o: -2, dl: 2, items: [
      { name: "Internal oak veneer doors", quantity: 8, unit: "doors", unitCost: 55 },
      { name: "Door linings & stops", quantity: 8, unit: "sets", unitCost: 12 },
      { name: "Ogee skirting 95mm MDF", quantity: 70, unit: "metres", unitCost: 2.80 },
      { name: "Ogee architrave 55mm MDF", quantity: 50, unit: "metres", unitCost: 2.20 },
      { name: "Door handles chrome lever", quantity: 8, unit: "pairs", unitCost: 12 },
    ]},
    { t: "The Oakwood", j: "Decoration", s: sup["Dulux Trade Centre"], d: "Interior paint and decorating", o: -1, dl: 2, items: [
      { name: "Matt emulsion white 5L", quantity: 6, unit: "tins", unitCost: 22 },
      { name: "Vinyl silk white 5L", quantity: 3, unit: "tins", unitCost: 25 },
      { name: "Undercoat 2.5L", quantity: 2, unit: "tins", unitCost: 16 },
      { name: "Gloss white 2.5L", quantity: 2, unit: "tins", unitCost: 18 },
    ]},
    { t: "The Oakwood", j: "External Works", s: sup["Travis Perkins"], d: "External works and landscaping", o: -2, dl: 3, items: [
      { name: "Block paving 200x100mm", quantity: 35, unit: "m\u00B2", unitCost: 18 },
      { name: "Paving edging kerbs", quantity: 25, unit: "metres", unitCost: 6 },
      { name: "Sharp sand (bedding)", quantity: 4, unit: "tonnes", unitCost: 45 },
      { name: "Premium lawn turf", quantity: 60, unit: "m\u00B2", unitCost: 4.50 },
      { name: "Fence panels 6x6ft", quantity: 8, unit: "panels", unitCost: 28 },
    ]},

    // ===== THE BRIARWOOD gaps =====
    { t: "The Briarwood", j: "Brickwork to DPC", s: sup["Ibstock Brick"], d: "Bricks for DPC level", o: -2, dl: 2, items: [
      { name: "Engineering bricks Class B", quantity: 1200, unit: "bricks", unitCost: 0.45 },
      { name: "DPC membrane 150mm", quantity: 30, unit: "metres", unitCost: 0.90 },
    ]},
    { t: "The Briarwood", j: "Floor Slab & Beam Block", s: sup["Jewson"], d: "Beam and block floor system", o: -3, dl: 3, items: [
      { name: "Prestressed concrete beams", quantity: 18, unit: "beams", unitCost: 28 },
      { name: "Concrete infill blocks", quantity: 250, unit: "blocks", unitCost: 2.40 },
      { name: "Floor insulation 100mm PIR", quantity: 80, unit: "m\u00B2", unitCost: 14 },
    ]},
    { t: "The Briarwood", j: "Gable Ends & Chimney", s: sup["Ibstock Brick"], d: "Gable end bricks and chimney", o: -2, dl: 2, items: [
      { name: "Facing bricks for gables", quantity: 2500, unit: "bricks", unitCost: 0.55 },
      { name: "Chimney pot & cowl", quantity: 1, unit: "set", unitCost: 85 },
      { name: "Chimney flashing lead", quantity: 1, unit: "kit", unitCost: 120 },
    ]},
    { t: "The Briarwood", j: "External Doors & Frames", s: sup["Travis Perkins"], d: "External doors and hardware", o: -2, dl: 2, items: [
      { name: "Back door composite", quantity: 1, unit: "door", unitCost: 450 },
      { name: "Utility door half-glazed", quantity: 1, unit: "door", unitCost: 320 },
      { name: "Door furniture pack (ext)", quantity: 2, unit: "sets", unitCost: 35 },
    ]},
    { t: "The Briarwood", j: "Gas Installation", s: sup["Jewson"], d: "Gas boiler and pipework", o: -3, dl: 3, items: [
      { name: "Combi boiler 30kW", quantity: 1, unit: "unit", unitCost: 850 },
      { name: "Gas pipe 22mm", quantity: 15, unit: "metres", unitCost: 8 },
      { name: "Gas meter box", quantity: 1, unit: "unit", unitCost: 45 },
      { name: "Flue kit", quantity: 1, unit: "kit", unitCost: 95 },
    ]},
    { t: "The Briarwood", j: "Plumbing Second Fix", s: sup["Travis Perkins"], d: "Second fix bathroom fittings", o: -2, dl: 2, items: [
      { name: "Thermostatic radiator valves", quantity: 10, unit: "pairs", unitCost: 12 },
      { name: "Towel rail chrome 500x800", quantity: 2, unit: "pcs", unitCost: 55 },
      { name: "Kitchen mixer tap", quantity: 1, unit: "tap", unitCost: 85 },
    ]},
    { t: "The Briarwood", j: "Electrical Second Fix", s: sup["Edmundson Electrical"], d: "Second fix electrical fittings", o: -2, dl: 2, items: [
      { name: "Double sockets white", quantity: 35, unit: "pcs", unitCost: 3.50 },
      { name: "Single switches white", quantity: 20, unit: "pcs", unitCost: 2.80 },
      { name: "Downlights LED", quantity: 30, unit: "pcs", unitCost: 8.50 },
      { name: "Smoke alarms interconnected", quantity: 6, unit: "pcs", unitCost: 22 },
      { name: "Outdoor PIR light", quantity: 2, unit: "pcs", unitCost: 35 },
    ]},

    // ===== THE RIVERSIDE gaps =====
    { t: "The Riverside", j: "Door Openings & Lintels", s: sup["Jewson"], d: "Lintels and door frames", o: -2, dl: 2, items: [
      { name: "Concrete lintels 1200mm", quantity: 6, unit: "pcs", unitCost: 12.50 },
      { name: "Steel lintels 1800mm", quantity: 2, unit: "pcs", unitCost: 28 },
      { name: "Door frames softwood", quantity: 6, unit: "sets", unitCost: 18 },
    ]},
    { t: "The Riverside", j: "MVHR / Ventilation", s: sup["Edmundson Electrical"], d: "MVHR unit and ducting", o: -3, dl: 3, items: [
      { name: "MVHR unit with heat recovery", quantity: 1, unit: "unit", unitCost: 650 },
      { name: "Ducting 125mm semi-rigid", quantity: 25, unit: "metres", unitCost: 8 },
      { name: "Ceiling valves", quantity: 6, unit: "pcs", unitCost: 12 },
    ]},
    { t: "The Riverside", j: "Floor Screed", s: sup["Jewson"], d: "Floor screed materials", o: -1, dl: 2, items: [
      { name: "Liquid floor screed", quantity: 4, unit: "m\u00B3", unitCost: 95 },
      { name: "Edge insulation strip", quantity: 20, unit: "metres", unitCost: 1.50 },
    ]},
    { t: "The Riverside", j: "Plumbing Second Fix", s: sup["Travis Perkins"], d: "Radiators and towel rail", o: -2, dl: 2, items: [
      { name: "Compact radiators (various)", quantity: 4, unit: "pcs", unitCost: 55 },
      { name: "TRV pairs", quantity: 4, unit: "pairs", unitCost: 12 },
      { name: "Towel rail chrome", quantity: 1, unit: "pcs", unitCost: 55 },
    ]},
    { t: "The Riverside", j: "Electrical Second Fix", s: sup["Edmundson Electrical"], d: "Second fix electrical fittings", o: -2, dl: 2, items: [
      { name: "Double sockets white", quantity: 16, unit: "pcs", unitCost: 3.50 },
      { name: "Single switches white", quantity: 8, unit: "pcs", unitCost: 2.80 },
      { name: "Downlights LED", quantity: 12, unit: "pcs", unitCost: 8.50 },
      { name: "Smoke alarms", quantity: 3, unit: "pcs", unitCost: 22 },
    ]},
    { t: "The Riverside", j: "Ironmongery & Accessories", s: sup["Travis Perkins"], d: "Ironmongery and accessories", o: -1, dl: 2, items: [
      { name: "Coat hooks", quantity: 4, unit: "pcs", unitCost: 8 },
      { name: "Bathroom accessories set", quantity: 1, unit: "set", unitCost: 45 },
      { name: "Door numbers/letters", quantity: 1, unit: "set", unitCost: 15 },
      { name: "Letterbox & door knocker", quantity: 1, unit: "set", unitCost: 25 },
    ]},
  ];

  let created = 0;
  for (const def of ordersToCreate) {
    const job = allTemplateJobs.find((j) => j.name === def.j && j.template.name === def.t);
    if (!job) { console.log("SKIP: " + def.t + " / " + def.j + " not found"); continue; }
    if (job.orders.length > 0) { console.log("SKIP: " + def.t + " / " + def.j + " has " + job.orders.length + " orders"); continue; }

    const order = await p.templateOrder.create({
      data: { templateJobId: job.id, supplierId: def.s, itemsDescription: def.d, orderWeekOffset: def.o, deliveryWeekOffset: def.dl },
    });
    for (const item of def.items) {
      await p.templateOrderItem.create({
        data: { templateOrderId: order.id, name: item.name, quantity: item.quantity, unit: item.unit, unitCost: item.unitCost },
      });
    }
    created++;
    console.log("Created: " + def.t + " / " + def.j + " (" + def.items.length + " items)");
  }

  console.log("\nTotal created:", created);
  const total = await p.templateOrder.count();
  console.log("Total template orders now:", total);
  await p.$disconnect();
}

main().catch(console.error);
