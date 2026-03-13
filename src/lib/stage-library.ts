// Predefined UK housebuilding stages with standard sub-jobs

export interface StageSubJob {
  code: string;
  name: string;
  defaultDuration: number; // weeks
}

export interface StageDefinition {
  code: string;
  name: string;
  subJobs: StageSubJob[];
}

export const UK_HOUSEBUILDING_STAGES: StageDefinition[] = [
  {
    code: "GW",
    name: "Groundworks",
    subJobs: [
      { code: "FND", name: "Foundations", defaultDuration: 2 },
      { code: "DPC", name: "Damp Proof Course", defaultDuration: 1 },
      { code: "OG", name: "Oversite", defaultDuration: 1 },
      { code: "DRN", name: "Drainage", defaultDuration: 1 },
    ],
  },
  {
    code: "BW",
    name: "Brickwork",
    subJobs: [
      { code: "B1", name: "Brickwork 1st Lift", defaultDuration: 2 },
      { code: "B2", name: "Brickwork 2nd Lift", defaultDuration: 2 },
    ],
  },
  {
    code: "RF",
    name: "Roofing",
    subJobs: [
      { code: "RFS", name: "Roof Structure", defaultDuration: 1 },
      { code: "TL", name: "Tiling", defaultDuration: 1 },
    ],
  },
  {
    code: "1F",
    name: "First Fix",
    subJobs: [
      { code: "1FE", name: "First Fix Electrical", defaultDuration: 2 },
      { code: "1FP", name: "First Fix Plumbing", defaultDuration: 2 },
      { code: "1FJ", name: "First Fix Joinery", defaultDuration: 2 },
    ],
  },
  {
    code: "PL",
    name: "Plastering",
    subJobs: [
      { code: "PL", name: "Plastering", defaultDuration: 2 },
    ],
  },
  {
    code: "2F",
    name: "Second Fix",
    subJobs: [
      { code: "2FE", name: "Second Fix Electrical", defaultDuration: 1 },
      { code: "2FP", name: "Second Fix Plumbing", defaultDuration: 1 },
      { code: "2FJ", name: "Second Fix Joinery", defaultDuration: 1 },
    ],
  },
  {
    code: "DEC",
    name: "Decoration",
    subJobs: [
      { code: "DEC", name: "Decoration", defaultDuration: 2 },
    ],
  },
  {
    code: "EXT",
    name: "Externals",
    subJobs: [
      { code: "EXT", name: "External Works", defaultDuration: 2 },
    ],
  },
  {
    code: "SH",
    name: "Snagging & Handover",
    subJobs: [
      { code: "SNG", name: "Snagging", defaultDuration: 1 },
      { code: "HO", name: "Handover", defaultDuration: 1 },
    ],
  },
];

export const CUSTOM_STAGE_KEY = "__CUSTOM__";

/** Get total default duration (weeks) for a stage */
export function getStageTotalWeeks(stage: StageDefinition): number {
  return stage.subJobs.reduce((sum, sj) => sum + sj.defaultDuration, 0);
}
