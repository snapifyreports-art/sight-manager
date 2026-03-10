import { PrismaClient } from "@prisma/client";
import { addWeeks, addDays, subWeeks } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Latest Site Park...");

  // Get existing site manager user
  const siteManager = await prisma.user.findUnique({
    where: { email: "john@sightmanager.com" },
  });
  if (!siteManager) throw new Error("Site manager user not found — run base seed first");

  // ─── NEW SUPPLIERS (sequential to avoid pool exhaustion) ─────────
  console.log("Creating suppliers...");

  const ibstock = await prisma.supplier.create({
    data: { name: "Ibstock Brick", contactName: "Rachel Green", contactEmail: "orders@ibstock.co.uk", contactNumber: "0344 800 4575", type: "Bricks", accountNumber: "IB-20145" },
  });
  const kingspan = await prisma.supplier.create({
    data: { name: "Kingspan Insulation", contactName: "Peter Walsh", contactEmail: "orders@kingspan.com", contactNumber: "01onal 544024", type: "Insulation", accountNumber: "KS-30982" },
  });
  const forterra = await prisma.supplier.create({
    data: { name: "Forterra Building Products", contactName: "Helen Marsh", contactEmail: "sales@forterra.co.uk", contactNumber: "01onal 312312", type: "Blocks", accountNumber: "FT-40213" },
  });
  const polypipe = await prisma.supplier.create({
    data: { name: "Polypipe", contactName: "David Barnes", contactEmail: "trade@polypipe.com", contactNumber: "01onal 770770", type: "Drainage", accountNumber: "PP-55489" },
  });
  const howdens = await prisma.supplier.create({
    data: { name: "Howdens Joinery", contactName: "Karen Mitchell", contactEmail: "orders@howdens.com", contactNumber: "01onal 474747", type: "Kitchens", accountNumber: "HW-61204" },
  });
  const toppsTiles = await prisma.supplier.create({
    data: { name: "Topps Tiles", contactName: "Michael Grant", contactEmail: "trade@toppstiles.co.uk", contactNumber: "0800 783 6262", type: "Tiles", accountNumber: "TT-71835" },
  });
  const dulux = await prisma.supplier.create({
    data: { name: "Dulux Trade Centre", contactName: "Emma Scott", contactEmail: "trade@dulux.co.uk", contactNumber: "0333 222 7171", type: "Paint", accountNumber: "DT-82091" },
  });
  const britishGypsum = await prisma.supplier.create({
    data: { name: "British Gypsum", contactName: "Tom Fletcher", contactEmail: "orders@british-gypsum.com", contactNumber: "0115 945 1000", type: "Plaster", accountNumber: "BG-93456" },
  });

  // Get existing suppliers
  const travisPerkins = await prisma.supplier.findFirst({ where: { name: "Travis Perkins" } });
  const marley = await prisma.supplier.findFirst({ where: { name: "Marley Roof Tiles" } });
  const edmundson = await prisma.supplier.findFirst({ where: { name: "Edmundson Electrical" } });

  console.log("  8 suppliers created");

  // ─── NEW CONTRACTOR CONTACTS (sequential) ────────────────────────
  console.log("Creating contractors...");

  const contractorDefs = [
    { name: "Gary Nichols", email: "gary@nicholsgroundworks.co.uk", phone: "07700 900101", company: "Nichols Groundworks Ltd", notes: "Specialises in residential foundations. 3 gangs available." },
    { name: "Tom Bradley", email: "tom@bradleybricklaying.co.uk", phone: "07700 900102", company: "Bradley Bricklaying", notes: "Gang of 6 bricklayers. Very reliable." },
    { name: "Dan Matthews", email: "dan@peakroofing.co.uk", phone: "07700 900103", company: "Peak Roofing Services", notes: "Handles trusses, tiling and leadwork." },
    { name: "Chris Walker", email: "chris@walkerelectrical.co.uk", phone: "07700 900104", company: "Walker Electrical Ltd", notes: "Part P certified. Handles first and second fix." },
    { name: "James Patel", email: "james@patelplumbing.co.uk", phone: "07700 900105", company: "Patel Plumbing & Heating", notes: "Gas Safe registered. Full heating and plumbing." },
    { name: "Sean Murphy", email: "sean@murphyplastering.co.uk", phone: "07700 900106", company: "Murphy Plastering", notes: "Fast turnaround, quality finish." },
    { name: "Alan Cooper", email: "alan@coopercarpentry.co.uk", phone: "07700 900107", company: "Cooper Carpentry & Joinery", notes: "First fix, second fix and kitchens." },
    { name: "Lisa Chen", email: "lisa@chenkitchens.co.uk", phone: "07700 900108", company: "Chen Kitchen Installations", notes: "Howdens approved installer." },
    { name: "Mark Roberts", email: "mark@robertsdecorating.co.uk", phone: "07700 900109", company: "Roberts Decorating", notes: "Painting and decorating, new build specialist." },
    { name: "Wayne Fisher", email: "wayne@fisherlandscapes.co.uk", phone: "07700 900110", company: "Fisher Landscapes", notes: "Driveways, fencing, turfing, paths." },
  ];

  const contractors: Array<{ id: string; name: string }> = [];
  for (const cd of contractorDefs) {
    const c = await prisma.contact.create({
      data: { name: cd.name, email: cd.email, phone: cd.phone, type: "CONTRACTOR", company: cd.company, notes: cd.notes },
    });
    contractors.push(c);
  }

  // Supplier contacts
  const supplierContactDefs = [
    { name: "Rachel Green", email: "orders@ibstock.co.uk", phone: "0344 800 4575", company: "Ibstock Brick" },
    { name: "Peter Walsh", email: "orders@kingspan.com", phone: "01onal 544024", company: "Kingspan Insulation" },
    { name: "Helen Marsh", email: "sales@forterra.co.uk", phone: "01onal 312312", company: "Forterra Building Products" },
    { name: "David Barnes", email: "trade@polypipe.com", phone: "01onal 770770", company: "Polypipe" },
    { name: "Karen Mitchell", email: "orders@howdens.com", phone: "01onal 474747", company: "Howdens Joinery" },
    { name: "Michael Grant", email: "trade@toppstiles.co.uk", phone: "0800 783 6262", company: "Topps Tiles" },
    { name: "Emma Scott", email: "trade@dulux.co.uk", phone: "0333 222 7171", company: "Dulux Trade Centre" },
    { name: "Tom Fletcher", email: "orders@british-gypsum.com", phone: "0115 945 1000", company: "British Gypsum" },
  ];
  for (const sc of supplierContactDefs) {
    await prisma.contact.create({
      data: { name: sc.name, email: sc.email, phone: sc.phone, type: "SUPPLIER", company: sc.company },
    });
  }

  console.log("  10 contractors + 8 supplier contacts created");

  // ─── CREATE SITE ─────────────────────────────────────────────────
  console.log("Creating site...");

  const site = await prisma.site.create({
    data: {
      name: "Latest Site Park",
      description: "New build residential development of 41 homes across 4 house types. Includes detached, semi-detached and terraced properties.",
      location: "Coventry",
      address: "Latest Site Park, Binley Road, Coventry, CV3 2AA",
      status: "ACTIVE",
      createdById: siteManager.id,
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "SITE_CREATED",
      description: "Site 'Latest Site Park' created — 41 plot residential development",
      siteId: site.id,
      userId: siteManager.id,
    },
  });

  // ─── HOUSE BUILD STAGES ──────────────────────────────────────────
  const stages = [
    { name: "Foundations",        code: "FND", desc: "Excavation, concrete pour, foundation walls",      startWeek: 1,  endWeek: 3 },
    { name: "Oversite / DPC",     code: "DPC", desc: "Oversite concrete, damp proof course, drainage",   startWeek: 3,  endWeek: 4 },
    { name: "Brickwork 1st Lift", code: "B1",  desc: "Brickwork and blockwork to first floor level",     startWeek: 4,  endWeek: 7 },
    { name: "Brickwork 2nd Lift", code: "B2",  desc: "Brickwork and blockwork to wallplate level",       startWeek: 7,  endWeek: 10 },
    { name: "Roof Carcass",       code: "RF",  desc: "Roof trusses, felt, batten and fascia",            startWeek: 10, endWeek: 12 },
    { name: "Roof Tile",          code: "RT",  desc: "Roof tiling, leadwork, flashing and pointing",     startWeek: 12, endWeek: 13 },
    { name: "First Fix",          code: "FX1", desc: "Electrical, plumbing, carpentry first fix",        startWeek: 13, endWeek: 16 },
    { name: "Plastering",         code: "PLS", desc: "Skim coat plaster to all walls and ceilings",      startWeek: 16, endWeek: 18 },
    { name: "Second Fix",         code: "FX2", desc: "Sockets, switches, sanitaryware, doors, skirting", startWeek: 18, endWeek: 21 },
    { name: "Painting",           code: "PNT", desc: "Mist coat, undercoat and topcoat throughout",      startWeek: 21, endWeek: 23 },
    { name: "Finals",             code: "FNL", desc: "Kitchen fit, tiling, snagging, clean",             startWeek: 23, endWeek: 25 },
    { name: "CML / Completion",   code: "CML", desc: "NHBC inspection, meter install, handover prep",    startWeek: 25, endWeek: 26 },
  ];

  // Contractor index mapping
  const GROUNDWORKS = 0, BRICKLAYER = 1, ROOFER = 2, ELECTRICIAN = 3, PLUMBER = 4;
  const PLASTERER = 5, JOINER = 6, KITCHEN = 7, PAINTER = 8, LANDSCAPER = 9;

  const stageContractors: Record<string, number[]> = {
    FND: [GROUNDWORKS], DPC: [GROUNDWORKS],
    B1: [BRICKLAYER], B2: [BRICKLAYER],
    RF: [ROOFER], RT: [ROOFER],
    FX1: [ELECTRICIAN, PLUMBER, JOINER],
    PLS: [PLASTERER],
    FX2: [ELECTRICIAN, PLUMBER, JOINER],
    PNT: [PAINTER],
    FNL: [KITCHEN, JOINER],
    CML: [LANDSCAPER],
  };

  // ─── 41 PLOT DEFINITIONS ─────────────────────────────────────────
  const today = new Date("2026-03-09");

  const plotDefs = [
    // Plots 1-8: Detached 4-Bed "Oakfield"
    { num: "1",  ht: "Detached 4-Bed (Oakfield)",    wa: 20, res: "Reserved" },
    { num: "2",  ht: "Detached 4-Bed (Oakfield)",    wa: 20, res: "Reserved" },
    { num: "3",  ht: "Detached 4-Bed (Oakfield)",    wa: 18, res: "Exchanged" },
    { num: "4",  ht: "Detached 4-Bed (Oakfield)",    wa: 18 },
    { num: "5",  ht: "Detached 4-Bed (Oakfield)",    wa: 16 },
    { num: "6",  ht: "Detached 4-Bed (Oakfield)",    wa: 16 },
    { num: "7",  ht: "Detached 4-Bed (Oakfield)",    wa: 14 },
    { num: "8",  ht: "Detached 4-Bed (Oakfield)",    wa: 14 },
    // Plots 9-22: Semi-Det 3-Bed "Birchwood"
    { num: "9",  ht: "Semi-Det 3-Bed (Birchwood)",   wa: 12 },
    { num: "10", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 12, res: "Reserved" },
    { num: "11", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 10 },
    { num: "12", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 10 },
    { num: "13", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 8 },
    { num: "14", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 8, res: "Reserved" },
    { num: "15", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 6 },
    { num: "16", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 6 },
    { num: "17", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 4 },
    { num: "18", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 4, res: "Exchanged" },
    { num: "19", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 2 },
    { num: "20", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 2 },
    { num: "21", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 0 },
    { num: "22", ht: "Semi-Det 3-Bed (Birchwood)",   wa: 0 },
    // Plots 23-34: Terraced 2-Bed "Cedar"
    { num: "23", ht: "Terraced 2-Bed (Cedar)",       wa: -2 },
    { num: "24", ht: "Terraced 2-Bed (Cedar)",       wa: -2 },
    { num: "25", ht: "Terraced 2-Bed (Cedar)",       wa: -4 },
    { num: "26", ht: "Terraced 2-Bed (Cedar)",       wa: -4 },
    { num: "27", ht: "Terraced 2-Bed (Cedar)",       wa: -6 },
    { num: "28", ht: "Terraced 2-Bed (Cedar)",       wa: -6 },
    { num: "29", ht: "Terraced 2-Bed (Cedar)",       wa: -8 },
    { num: "30", ht: "Terraced 2-Bed (Cedar)",       wa: -8 },
    { num: "31", ht: "Terraced 2-Bed (Cedar)",       wa: -10 },
    { num: "32", ht: "Terraced 2-Bed (Cedar)",       wa: -10 },
    { num: "33", ht: "Terraced 2-Bed (Cedar)",       wa: -12 },
    { num: "34", ht: "Terraced 2-Bed (Cedar)",       wa: -12 },
    // Plots 35-41: Detached 5-Bed "Elmwood"
    { num: "35", ht: "Detached 5-Bed (Elmwood)",     wa: -14 },
    { num: "36", ht: "Detached 5-Bed (Elmwood)",     wa: -14 },
    { num: "37", ht: "Detached 5-Bed (Elmwood)",     wa: -16 },
    { num: "38", ht: "Detached 5-Bed (Elmwood)",     wa: -16 },
    { num: "39", ht: "Detached 5-Bed (Elmwood)",     wa: -18 },
    { num: "40", ht: "Detached 5-Bed (Elmwood)",     wa: -18 },
    { num: "41", ht: "Detached 5-Bed (Elmwood)",     wa: -20 },
  ];

  // ─── CREATE PLOTS, JOBS, CONTRACTORS, ORDERS ─────────────────────
  console.log("Creating 41 plots with jobs...");
  let totalJobs = 0;
  let totalOrders = 0;

  for (const pd of plotDefs) {
    const plotStartDate = subWeeks(today, pd.wa);
    const we = pd.wa; // weeks elapsed

    const plot = await prisma.plot.create({
      data: {
        name: `Plot ${pd.num}`,
        plotNumber: pd.num,
        siteId: site.id,
        houseType: pd.ht,
        reservationType: pd.res || null,
        approvalG: we >= 4 && we > 0,
        approvalE: we >= 13 && we > 0,
        approvalW: we >= 13 && we > 0,
        approvalKCO: we >= 25 && we > 0,
      },
    });

    // Create each job sequentially
    const plotJobs: Array<{ id: string; code: string; start: Date; end: Date; status: string }> = [];

    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      const jStart = addWeeks(plotStartDate, st.startWeek - 1);
      const jEnd = addDays(addWeeks(plotStartDate, st.endWeek - 1), 6);

      let status: "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" = "NOT_STARTED";
      let actualStart: Date | null = null;
      let actualEnd: Date | null = null;

      if (we > 0) {
        if (we >= st.endWeek) {
          status = "COMPLETED";
          actualStart = addDays(jStart, Math.floor(Math.random() * 3));
          actualEnd = addDays(jEnd, Math.floor(Math.random() * 5) - 2);
        } else if (we >= st.startWeek) {
          status = "IN_PROGRESS";
          actualStart = addDays(jStart, Math.floor(Math.random() * 3));
        }
      }

      // Plot 14: hold on B2
      if (pd.num === "14" && st.code === "B2" && status === "IN_PROGRESS") {
        status = "ON_HOLD";
      }

      const job = await prisma.job.create({
        data: {
          name: st.name, description: st.desc, plotId: plot.id,
          stageCode: st.code, sortOrder: i,
          startDate: jStart, endDate: jEnd,
          status, actualStartDate: actualStart, actualEndDate: actualEnd,
        },
      });

      plotJobs.push({ id: job.id, code: st.code, start: jStart, end: jEnd, status });

      // Assign contractors
      const cis = stageContractors[st.code] || [];
      for (const ci of cis) {
        await prisma.jobContractor.create({
          data: { jobId: job.id, contactId: contractors[ci].id },
        });
      }

      totalJobs++;
    }

    // ─── ORDERS (only for plots that have started or about to) ─────
    if (we >= -2) {
      // Helper
      const orderStatus = (jobStatus: string, threshold?: string) => {
        if (jobStatus === "COMPLETED") return "DELIVERED" as const;
        if (jobStatus === "IN_PROGRESS") return "CONFIRMED" as const;
        return "PENDING" as const;
      };

      // 1. Foundation: Concrete
      const fnd = plotJobs.find((j) => j.code === "FND")!;
      const o1 = await prisma.materialOrder.create({
        data: {
          supplierId: travisPerkins!.id, jobId: fnd.id,
          orderDetails: `Concrete for Plot ${pd.num} foundations`,
          orderType: "Materials", status: orderStatus(fnd.status),
          dateOfOrder: addWeeks(fnd.start, -2), expectedDeliveryDate: fnd.start,
          deliveredDate: fnd.status === "COMPLETED" ? addDays(fnd.start, 1) : null,
          leadTimeDays: 7, itemsDescription: "Ready-mix concrete for foundations",
        },
      });
      await prisma.orderItem.createMany({ data: [
        { orderId: o1.id, name: "Ready-mix Concrete C30", quantity: 36, unit: "m\u00B3", unitCost: 98, totalCost: 3528 },
        { orderId: o1.id, name: "Steel Reinforcement Mesh A393", quantity: 20, unit: "sheets", unitCost: 42, totalCost: 840 },
      ]});
      totalOrders++;

      // 2. Brickwork: Bricks + blocks (if >=2 weeks in)
      if (we >= 2) {
        const b1 = plotJobs.find((j) => j.code === "B1")!;
        const o2 = await prisma.materialOrder.create({
          data: {
            supplierId: ibstock.id, jobId: b1.id,
            orderDetails: `Bricks & blocks for Plot ${pd.num}`,
            orderType: "Materials", status: orderStatus(b1.status),
            dateOfOrder: addWeeks(b1.start, -3), expectedDeliveryDate: addDays(b1.start, -3),
            deliveredDate: b1.status === "COMPLETED" || b1.status === "IN_PROGRESS" ? addDays(b1.start, -2) : null,
            leadTimeDays: 14, itemsDescription: "Facing bricks and concrete blocks",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o2.id, name: "Ibstock Tradesman Rustic", quantity: 8000, unit: "units", unitCost: 0.48, totalCost: 3840 },
          { orderId: o2.id, name: "Forterra Thermalite Blocks", quantity: 400, unit: "units", unitCost: 2.85, totalCost: 1140 },
          { orderId: o2.id, name: "Building Sand (bulk bag)", quantity: 6, unit: "bags", unitCost: 55, totalCost: 330 },
          { orderId: o2.id, name: "Cement OPC 25kg", quantity: 40, unit: "bags", unitCost: 6.80, totalCost: 272 },
        ]});
        totalOrders++;

        // Insulation
        const o2b = await prisma.materialOrder.create({
          data: {
            supplierId: kingspan.id, jobId: b1.id,
            orderDetails: `Insulation for Plot ${pd.num}`,
            orderType: "Materials", status: b1.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(b1.start, -2), expectedDeliveryDate: b1.start,
            deliveredDate: b1.status === "COMPLETED" ? addDays(b1.start, 1) : null,
            leadTimeDays: 10, itemsDescription: "Cavity wall and floor insulation",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o2b.id, name: "Kingspan Kooltherm K106 75mm", quantity: 30, unit: "packs", unitCost: 38.50, totalCost: 1155 },
          { orderId: o2b.id, name: "Kingspan Thermafloor TF70 100mm", quantity: 12, unit: "packs", unitCost: 45, totalCost: 540 },
        ]});
        totalOrders++;
      }

      // 3. Roofing (if >=7 weeks in)
      if (we >= 7) {
        const rf = plotJobs.find((j) => j.code === "RF")!;
        const o3 = await prisma.materialOrder.create({
          data: {
            supplierId: marley!.id, jobId: rf.id,
            orderDetails: `Roof materials for Plot ${pd.num}`,
            orderType: "Materials", status: orderStatus(rf.status),
            dateOfOrder: addWeeks(rf.start, -4), expectedDeliveryDate: rf.start,
            deliveredDate: rf.status === "COMPLETED" ? rf.start : null,
            leadTimeDays: 21, itemsDescription: "Roof trusses, tiles and accessories",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o3.id, name: "Fink Roof Trusses (bespoke)", quantity: 14, unit: "sets", unitCost: 295, totalCost: 4130 },
          { orderId: o3.id, name: "Marley Edgemere Tiles", quantity: 1800, unit: "tiles", unitCost: 1.10, totalCost: 1980 },
          { orderId: o3.id, name: "Roofing Felt Breathable", quantity: 6, unit: "rolls", unitCost: 48, totalCost: 288 },
          { orderId: o3.id, name: "Tile Battens 25x50mm", quantity: 80, unit: "lengths", unitCost: 3.20, totalCost: 256 },
        ]});
        totalOrders++;
      }

      // 4. Electrical first fix (if >=11 weeks in)
      if (we >= 11) {
        const fx1 = plotJobs.find((j) => j.code === "FX1")!;
        const o4 = await prisma.materialOrder.create({
          data: {
            supplierId: edmundson!.id, jobId: fx1.id,
            orderDetails: `Electrical first fix for Plot ${pd.num}`,
            orderType: "Materials", status: fx1.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(fx1.start, -2), expectedDeliveryDate: fx1.start,
            deliveredDate: fx1.status === "COMPLETED" ? addDays(fx1.start, 1) : null,
            leadTimeDays: 7, itemsDescription: "Cables, back boxes, consumer unit",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o4.id, name: "T&E 2.5mm Cable (100m)", quantity: 8, unit: "rolls", unitCost: 42, totalCost: 336 },
          { orderId: o4.id, name: "T&E 1.5mm Cable (100m)", quantity: 4, unit: "rolls", unitCost: 32, totalCost: 128 },
          { orderId: o4.id, name: "Metal Back Boxes 35mm", quantity: 60, unit: "units", unitCost: 0.85, totalCost: 51 },
          { orderId: o4.id, name: "Consumer Unit 12-way", quantity: 1, unit: "units", unitCost: 145, totalCost: 145 },
        ]});
        totalOrders++;

        // Plumbing
        const o4b = await prisma.materialOrder.create({
          data: {
            supplierId: polypipe.id, jobId: fx1.id,
            orderDetails: `Plumbing first fix for Plot ${pd.num}`,
            orderType: "Materials", status: fx1.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(fx1.start, -2), expectedDeliveryDate: fx1.start,
            deliveredDate: fx1.status === "COMPLETED" ? fx1.start : null,
            leadTimeDays: 5, itemsDescription: "Pipework, fittings, drainage",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o4b.id, name: "15mm Copper Pipe (3m)", quantity: 30, unit: "lengths", unitCost: 8.50, totalCost: 255 },
          { orderId: o4b.id, name: "22mm Copper Pipe (3m)", quantity: 15, unit: "lengths", unitCost: 14.20, totalCost: 213 },
          { orderId: o4b.id, name: "110mm Soil Pipe (3m)", quantity: 8, unit: "lengths", unitCost: 18, totalCost: 144 },
        ]});
        totalOrders++;
      }

      // 5. Plastering (if >=14 weeks in)
      if (we >= 14) {
        const pls = plotJobs.find((j) => j.code === "PLS")!;
        const o5 = await prisma.materialOrder.create({
          data: {
            supplierId: britishGypsum.id, jobId: pls.id,
            orderDetails: `Plaster materials for Plot ${pd.num}`,
            orderType: "Materials", status: pls.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(pls.start, -1), expectedDeliveryDate: pls.start,
            deliveredDate: pls.status === "COMPLETED" ? pls.start : null,
            leadTimeDays: 5, itemsDescription: "Multi-finish plaster and plasterboard",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o5.id, name: "Thistle Multi-Finish 25kg", quantity: 40, unit: "bags", unitCost: 9.50, totalCost: 380 },
          { orderId: o5.id, name: "Gyproc WallBoard 12.5mm", quantity: 50, unit: "sheets", unitCost: 8.20, totalCost: 410 },
          { orderId: o5.id, name: "Bonding Coat 25kg", quantity: 15, unit: "bags", unitCost: 8.80, totalCost: 132 },
        ]});
        totalOrders++;
      }

      // 6. Paint (if >=19 weeks in)
      if (we >= 19) {
        const pnt = plotJobs.find((j) => j.code === "PNT")!;
        const o6 = await prisma.materialOrder.create({
          data: {
            supplierId: dulux.id, jobId: pnt.id,
            orderDetails: `Paint for Plot ${pd.num}`,
            orderType: "Materials", status: pnt.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(pnt.start, -1), expectedDeliveryDate: pnt.start,
            deliveredDate: pnt.status === "COMPLETED" ? pnt.start : null,
            leadTimeDays: 3, itemsDescription: "Emulsion, undercoat and gloss",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o6.id, name: "Dulux Trade Vinyl Matt White 10L", quantity: 6, unit: "tins", unitCost: 38, totalCost: 228 },
          { orderId: o6.id, name: "Dulux Trade Undercoat White 5L", quantity: 4, unit: "tins", unitCost: 32, totalCost: 128 },
          { orderId: o6.id, name: "Dulux Trade Gloss White 5L", quantity: 3, unit: "tins", unitCost: 35, totalCost: 105 },
        ]});
        totalOrders++;
      }

      // 7. Kitchen + Tiles (if >=18 weeks in)
      if (we >= 18) {
        const fnl = plotJobs.find((j) => j.code === "FNL")!;
        const o7 = await prisma.materialOrder.create({
          data: {
            supplierId: howdens.id, jobId: fnl.id,
            orderDetails: `Kitchen for Plot ${pd.num}`,
            orderType: "Materials",
            status: fnl.status === "COMPLETED" ? "DELIVERED" : we >= 22 ? "CONFIRMED" : "ORDERED",
            dateOfOrder: addWeeks(fnl.start, -5), expectedDeliveryDate: fnl.start,
            deliveredDate: fnl.status === "COMPLETED" ? addDays(fnl.start, -1) : null,
            leadTimeDays: 21, itemsDescription: "Full kitchen supply",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o7.id, name: "Kitchen Units (full set)", quantity: 1, unit: "set", unitCost: 2400, totalCost: 2400 },
          { orderId: o7.id, name: "Laminate Worktop 3m", quantity: 3, unit: "lengths", unitCost: 85, totalCost: 255 },
          { orderId: o7.id, name: "Sink & Tap Pack", quantity: 1, unit: "set", unitCost: 165, totalCost: 165 },
          { orderId: o7.id, name: "Hob & Oven Pack", quantity: 1, unit: "set", unitCost: 480, totalCost: 480 },
        ]});
        totalOrders++;

        const o7b = await prisma.materialOrder.create({
          data: {
            supplierId: toppsTiles.id, jobId: fnl.id,
            orderDetails: `Tiles for Plot ${pd.num}`,
            orderType: "Materials", status: fnl.status === "COMPLETED" ? "DELIVERED" : "ORDERED",
            dateOfOrder: addWeeks(fnl.start, -3), expectedDeliveryDate: addDays(fnl.start, 2),
            deliveredDate: fnl.status === "COMPLETED" ? addDays(fnl.start, 2) : null,
            leadTimeDays: 14, itemsDescription: "Bathroom and kitchen wall/floor tiles",
          },
        });
        await prisma.orderItem.createMany({ data: [
          { orderId: o7b.id, name: "White Gloss Wall Tile 250x400", quantity: 8, unit: "m\u00B2", unitCost: 14, totalCost: 112 },
          { orderId: o7b.id, name: "Grey Matt Floor Tile 300x300", quantity: 6, unit: "m\u00B2", unitCost: 22, totalCost: 132 },
          { orderId: o7b.id, name: "Tile Adhesive 20kg", quantity: 4, unit: "bags", unitCost: 12, totalCost: 48 },
        ]});
        totalOrders++;
      }
    }

    // Update build percentage
    const completed = plotJobs.filter((j) => j.status === "COMPLETED").length;
    const inProgress = plotJobs.filter((j) => j.status === "IN_PROGRESS").length;
    const pct = Math.round(((completed + inProgress * 0.5) / stages.length) * 100);

    await prisma.plot.update({
      where: { id: plot.id },
      data: { buildCompletePercent: pct },
    });

    await prisma.eventLog.create({
      data: {
        type: "PLOT_CREATED",
        description: `Plot ${pd.num} (${pd.ht}) created for Latest Site Park`,
        siteId: site.id, plotId: plot.id, userId: siteManager.id,
      },
    });

    if (Number(pd.num) % 10 === 0 || pd.num === "41") {
      console.log(`  Plot ${pd.num} done (${totalJobs} jobs, ${totalOrders} orders so far)`);
    }
  }

  // ─── EXTRA EVENT LOG ENTRIES ─────────────────────────────────────
  console.log("Adding event log entries...");

  await prisma.eventLog.createMany({
    data: [
      { type: "NOTIFICATION", description: "Weather warning: Heavy rain expected — protect open foundations", siteId: site.id, userId: siteManager.id, createdAt: subWeeks(today, 5) },
      { type: "NOTIFICATION", description: "Brick delivery delayed for Plots 15-16 — new ETA next week", siteId: site.id, userId: siteManager.id, createdAt: subWeeks(today, 2) },
      { type: "USER_ACTION", description: "Programme reviewed by John Hudson", siteId: site.id, userId: siteManager.id, createdAt: subWeeks(today, 1) },
      { type: "SYSTEM", description: "41 plots created via batch seed for Latest Site Park", siteId: site.id, createdAt: today },
    ],
  });

  console.log("\n=== Latest Site Park seeded successfully! ===");
  console.log(`  Site: Latest Site Park`);
  console.log(`  Plots: 41`);
  console.log(`  Jobs: ${totalJobs}`);
  console.log(`  Orders: ${totalOrders}`);
  console.log(`  New Suppliers: 8`);
  console.log(`  New Contractors: 10`);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
