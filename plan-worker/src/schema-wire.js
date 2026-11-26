// נוצר אוטומטית ע״י build-lite.mjs – לא לערוך ידנית
export const WIRE_FORMAT = {
 "type": "json_schema",
 "schema": {
  "type": "object",
  "properties": {
   "plan_type": {
    "enum": [
     "ceiling",
     "electrical",
     "floor",
     "mixed",
     "other"
    ]
   },
   "summary": {
    "type": "string"
   },
   "spot_cutout_mm": {
    "type": "number"
   },
   "scale": {
    "type": "object",
    "properties": {
     "found": {
      "type": "boolean"
     },
     "x1": {
      "type": "number"
     },
     "y1": {
      "type": "number"
     },
     "x2": {
      "type": "number"
     },
     "y2": {
      "type": "number"
     },
     "meters": {
      "type": "number"
     },
     "label": {
      "type": "string"
     }
    },
    "additionalProperties": false,
    "required": [
     "found",
     "x1",
     "y1",
     "x2",
     "y2",
     "meters",
     "label"
    ]
   },
   "ceilings": {
    "type": "array",
    "items": {
     "type": "object",
     "properties": {
      "name": {
       "type": "string"
      },
      "x0": {
       "type": "number"
      },
      "y0": {
       "type": "number"
      },
      "x1": {
       "type": "number"
      },
      "y1": {
       "type": "number"
      },
      "wet": {
       "type": "boolean"
      },
      "height_cm": {
       "type": "number"
      },
      "drop_cm": {
       "type": "number"
      }
     },
     "additionalProperties": false,
     "required": [
      "name",
      "x0",
      "y0",
      "x1",
      "y1",
      "wet",
      "height_cm",
      "drop_cm"
     ]
    }
   },
   "partitions": {
    "type": "array",
    "items": {
     "type": "object",
     "properties": {
      "x1": {
       "type": "number"
      },
      "y1": {
       "type": "number"
      },
      "x2": {
       "type": "number"
      },
      "y2": {
       "type": "number"
      },
      "lining": {
       "type": "boolean"
      },
      "height_cm": {
       "type": "number"
      }
     },
     "additionalProperties": false,
     "required": [
      "x1",
      "y1",
      "x2",
      "y2",
      "lining",
      "height_cm"
     ]
    }
   },
   "fixtures": {
    "type": "array",
    "items": {
     "type": "object",
     "properties": {
      "kind": {
       "enum": [
        "spot",
        "downlight",
        "speaker",
        "sprinkler",
        "detector",
        "linear",
        "vent",
        "panel",
        "custom"
       ]
      },
      "x": {
       "type": "number"
      },
      "y": {
       "type": "number"
      },
      "length_mm": {
       "type": "number"
      },
      "confidence": {
       "enum": [
        "high",
        "medium",
        "low"
       ]
      }
     },
     "additionalProperties": false,
     "required": [
      "kind",
      "x",
      "y",
      "length_mm",
      "confidence"
     ]
    }
   },
   "wall_elements": {
    "type": "array",
    "items": {
     "type": "object",
     "properties": {
      "kind": {
       "enum": [
        "door",
        "window",
        "box",
        "switch",
        "data"
       ]
      },
      "x": {
       "type": "number"
      },
      "y": {
       "type": "number"
      },
      "width_mm": {
       "type": "number"
      }
     },
     "additionalProperties": false,
     "required": [
      "kind",
      "x",
      "y",
      "width_mm"
     ]
    }
   },
   "notes": {
    "type": "array",
    "items": {
     "type": "string"
    }
   }
  },
  "additionalProperties": false,
  "required": [
   "plan_type",
   "summary",
   "spot_cutout_mm",
   "scale",
   "ceilings",
   "partitions",
   "fixtures",
   "wall_elements",
   "notes"
  ]
 }
};
