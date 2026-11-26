/* הנחיות ל-Claude ומבנה התשובה – משותף לשתי הגרסאות של השרת */
const num = { type: "number" };
export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plan_type", "summary", "spot_cutout_mm", "scale", "ceilings", "partitions", "fixtures", "wall_elements", "notes"],
  properties: {
    plan_type: { type: "string", enum: ["ceiling", "electrical", "floor", "mixed", "other"] },
    summary: { type: "string" },
    spot_cutout_mm: num,
    scale: {
      type: "object", additionalProperties: false,
      required: ["found", "x1", "y1", "x2", "y2", "meters", "label"],
      properties: { found: { type: "boolean" }, x1: num, y1: num, x2: num, y2: num, meters: num, label: { type: "string" } }
    },
    ceilings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "x0", "y0", "x1", "y1", "wet", "height_cm", "drop_cm"],
        properties: { name: { type: "string" }, x0: num, y0: num, x1: num, y1: num, wet: { type: "boolean" }, height_cm: num, drop_cm: num }
      }
    },
    partitions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["x1", "y1", "x2", "y2", "lining", "height_cm"],
        properties: { x1: num, y1: num, x2: num, y2: num, lining: { type: "boolean" }, height_cm: num }
      }
    },
    fixtures: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "x", "y", "length_mm", "confidence"],
        properties: {
          kind: { type: "string", enum: ["spot", "downlight", "speaker", "sprinkler", "detector", "linear", "vent", "panel", "custom"] },
          x: num, y: num, length_mm: num,
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        }
      }
    },
    wall_elements: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "x", "y", "width_mm"],
        properties: { kind: { type: "string", enum: ["door", "window", "box", "switch", "data"] }, x: num, y: num, width_mm: num }
      }
    },
    notes: { type: "array", items: { type: "string" } }
  }
};

export const SYSTEM = `You read Israeli architectural drawings (floor plans, reflected ceiling plans, electrical plans) for a drywall (gypsum board) contractor.
From the single drawing image you are given, extract what the contractor needs to plan ceiling grids and stud walls.

Coordinates: every x/y is normalized to 0-1000 across the image (x from the LEFT edge, y from the TOP edge), independent of the image's pixel size. Be as precise as you can - the contractor will place profiles around these points.

What to extract:
- scale: one clearly printed dimension (prefer the longest dimension line with a readable number). Give the two end points of that dimension line and its real length in meters (Israeli drawings are usually in cm, e.g. "420" = 4.20 m). found=false if no readable dimension.
- ceilings: rectangular areas that get a suspended gypsum ceiling (hatched or labeled areas, "תקרת גבס", "ת.ג", "הנמכה", levels like "+2.60"). If the drawing is a floor plan with no ceiling information, return each room as an area. wet=true for bathrooms, toilets, showers, laundry (אמבטיה, שירותים, מקלחת, כביסה). height_cm = finished ceiling height if printed, else 0. drop_cm = drop below the slab if printed, else 0. For non-rectangular rooms, give the bounding rectangle and mention it in notes.
- partitions: NEW gypsum walls only (labeled "גבס", "קיר גבס", "מחיצת גבס", or drawn with the drywall hatch). Each as a center-line segment. lining=true for gypsum lining on an existing wall (חיפוי גבס). height_cm if printed else 0. Do not return existing concrete or block walls as partitions.
- fixtures: ceiling items - recessed spots, round downlights, speakers, sprinklers, smoke detectors, linear light profiles (length_mm = their length), AC supply/return grilles (vent), access panels (panel). Use the legend on the sheet when there is one. One entry per symbol - count carefully.
- wall_elements: doors (width_mm from the plan, e.g. 80/90 cm), windows, and on electrical plans power outlets (box), switches (switch), and data/TV/phone points (data) - placed at the point on the wall.
- notes: short Hebrew notes about anything uncertain (unclear symbols, missing scale, parts of the sheet that are cut off).
- spot_cutout_mm: the largest recessed-spot cut-out diameter in mm if the legend or a note states it (e.g. "ספוט קוטר 8 ס\"מ" = 80), else 0.
- summary: one or two Hebrew sentences describing the sheet.

Report only what you can see. If something is unclear, lower its confidence or leave it out and say so in notes rather than guessing.`;

