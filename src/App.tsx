import { useState, useRef } from "react";
import type { PointerEvent } from "react";
import { downloadSurveyPDF } from "./utils/exportSurvey";

import {
  RotateCcw,
  Grid3X3,
  Download,
  Lock,
  Unlock,
  Move,
  Compass
} from "lucide-react";

import type { Point, Sides } from "./geometry";

import {
  distance,
  generateQuadrilateral,
  calculateArea,
  calculatePerimeter,
  calculateAngles,
  calculateDiagonals,
  getValidAngleRange,
  validateSideLengths,
  findClosestConfiguration,
  rotateQuadrilateral,
  translateQuadrilateral
} from "./geometry";

import "./App.css";

// ========================================
// CONSTANTS
// ========================================

const initialSides: Sides = {
  AB: 42.45,
  BC: 31.57,
  CD: 40.16,
  DA: 41.93
};

const labels = ["A", "B", "C", "D"];

const METRES_PER_FOOT = 0.3048;

const SVG_WIDTH = 900;
const SVG_HEIGHT = 650;

// ========================================
// UNIT CONVERSIONS
// ========================================

function toMetres(value: number, unit: string): number {
  return unit === "ft"
    ? value * METRES_PER_FOOT
    : value;
}

function fromMetres(value: number, unit: string): number {
  return unit === "ft"
    ? value / METRES_PER_FOOT
    : value;
}

function convertArea(value: number, unit: string): number {
  return unit === "ft"
    ? value / (METRES_PER_FOOT ** 2)
    : value;
}

// ========================================
// DRAG SESSION
// ========================================

type DragSession = {
  index: number;
  startPoints: Point[];
  startAngle: number;
  startSides: Sides;

  view: {
    scale: number;
    offsetX: number;
    offsetY: number;
    minWorldX: number;
    maxWorldY: number;
  };
};

// ========================================
// MAIN APP
// ========================================

function App() {

  // --------------------------------------
  // STATE
  // --------------------------------------

  const [sides, setSides] = useState<Sides>(initialSides);

  const [unit, setUnit] = useState("m");

  const [angle, setAngle] = useState(90);

  const [locked, setLocked] = useState(true);

  const [showGrid, setShowGrid] = useState(false);

  const [roadSides, setRoadSides] = useState({
    AB: false,
    BC: false,
    CD: false,
    DA: false
  });

  const [roadWidth, setRoadWidth] = useState(6);
  const toggleRoad = (side: keyof typeof roadSides) => {
    setRoadSides(prev => ({
      ...prev,
      [side]: !prev[side]
    }));
  };

  const updateRoadWidth = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;

    setRoadWidth(toMetres(value, unit));
  };
  // SURVEY INFORMATION

  const [surveyInfo, setSurveyInfo] = useState({
    surveyNumber: "125/1",
    plotNumber: "125/1",

    adjacentPlots: {
      AB: "125/2",
      BC: "126",
      CD: "125/3",
      DA: "124"
    },

    bearings: {
      AB: "N 87° 15' E",
      BC: "S 02° 30' E",
      CD: "S 87° 45' W",
      DA: "N 01° 45' W"
    },

    roadNames: {
      AB: "",
      BC: "Village Road",
      CD: "Village Road",
      DA: "Village Road"
    }
  });

  const updateSurveyField = (
    field: string,
    value: string
  ) => {
    setSurveyInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateAdjacentPlot = (
    side: keyof typeof surveyInfo.adjacentPlots,
    value: string
  ) => {
    setSurveyInfo(prev => ({
      ...prev,
      adjacentPlots: {
        ...prev.adjacentPlots,
        [side]: value
      }
    }));
  };

  const updateBearing = (
    side: keyof typeof surveyInfo.bearings,
    value: string
  ) => {
    setSurveyInfo(prev => ({
      ...prev,
      bearings: {
        ...prev.bearings,
        [side]: value
      }
    }));
  };

  const updateRoadName = (
    side: keyof typeof surveyInfo.roadNames,
    value: string
  ) => {
    setSurveyInfo(prev => ({
      ...prev,
      roadNames: {
        ...prev.roadNames,
        [side]: value
      }
    }));
  };

  const selectedRoadCount = Object.values(roadSides)
    .filter(Boolean).length;

  const [dragged, setDragged] = useState<number | null>(null);

  const [error, setError] = useState("");

  const [points, setPoints] = useState<Point[]>(
    generateQuadrilateral(initialSides, 90) || []
  );

  const dragSession = useRef<DragSession | null>(null);

  // --------------------------------------
  // DERIVED VALUES
  // --------------------------------------

  const angleRange = getValidAngleRange(sides);

  const dimensionError = validateSideLengths(sides);

  const area = calculateArea(points);

  const perimeter = calculatePerimeter(points);

  const angles = calculateAngles(points);

  const diagonals = calculateDiagonals(points);

  // --------------------------------------
  // UPDATE SIDES
  // --------------------------------------

  const updateSides = (
    key: keyof Sides,
    value: number
  ) => {

    const updated = {
      ...sides,
      [key]: value
    };

    setSides(updated);

    const validationError = validateSideLengths(updated);

    if (validationError) {
      setError(validationError);
      return;
    }

    const range = getValidAngleRange(updated);

    if (!range) {
      setError("No valid quadrilateral can be generated.");
      return;
    }

    const adjustedAngle = Math.max(
      range.min,
      Math.min(range.max, angle)
    );

    const generated = generateQuadrilateral(
      updated,
      adjustedAngle
    );

    if (generated) {

      setAngle(adjustedAngle);
      setPoints(generated);
      setError("");

    } else {

      setError("Unable to generate this configuration.");

    }
  };

  // --------------------------------------
  // UPDATE ANGLE
  // --------------------------------------

  const updateAngle = (value: number) => {

    if (!Number.isFinite(value)) return;

    if (!angleRange) return;

    if (
      value < angleRange.min ||
      value > angleRange.max
    ) {
      return;
    }

    const generated = generateQuadrilateral(
      sides,
      value
    );

    if (!generated) {
      setError("Invalid geometric configuration.");
      return;
    }

    setAngle(value);
    setPoints(generated);
    setError("");

  };

  // --------------------------------------
  // SVG COORDINATE TRANSFORMATION
  // --------------------------------------

  const minWorldX = Math.min(...points.map(p => p.x));
  const maxWorldX = Math.max(...points.map(p => p.x));

  const minWorldY = Math.min(...points.map(p => p.y));
  const maxWorldY = Math.max(...points.map(p => p.y));

  const worldWidth = Math.max(maxWorldX - minWorldX, 1);
  const worldHeight = Math.max(maxWorldY - minWorldY, 1);

  const calculatedScale = Math.min(
    650 / worldWidth,
    430 / worldHeight
  );

  const calculatedOffsetX =
    (SVG_WIDTH - worldWidth * calculatedScale) / 2;

  const HEADER_SPACE = 85;
  const BOTTOM_SPACE = 35;

  const calculatedOffsetY =
    HEADER_SPACE +
    (SVG_HEIGHT - HEADER_SPACE - BOTTOM_SPACE -
      worldHeight * calculatedScale) / 2;

  // Keep the canvas coordinate system stable while dragging.

  const view =
    dragged !== null && dragSession.current
      ? dragSession.current.view
      : {
        scale: calculatedScale,
        offsetX: calculatedOffsetX,
        offsetY: calculatedOffsetY,
        minWorldX,
        maxWorldY
      };

  const transformed = points.map(p => ({
    x:
      (p.x - view.minWorldX) * view.scale +
      view.offsetX,

    y:
      (view.maxWorldY - p.y) * view.scale +
      view.offsetY
  }));
  // --------------------------------
  // MATHEMATICAL ROAD GENERATION
  // --------------------------------

  const centerX =
    transformed.reduce((sum, p) => sum + p.x, 0) / 4;

  const centerY =
    transformed.reduce((sum, p) => sum + p.y, 0) / 4;

  const roadWidthPx = roadWidth * view.scale;

  const roads = transformed.flatMap((p1, i) => {

    const side = (["AB", "BC", "CD", "DA"] as const)[i];

    if (!roadSides[side]) return [];

    const p2 = transformed[(i + 1) % 4];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const length = Math.hypot(dx, dy);

    if (length === 0) return [];

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // Determine outward normal using polygon centre.

    let nx = midX - centerX;
    let ny = midY - centerY;

    const magnitude = Math.hypot(nx, ny);

    nx /= magnitude;
    ny /= magnitude;

    // Remove any component parallel to the side.
    // This produces a perpendicular outward normal.

    const dot = nx * dx + ny * dy;

    nx -= (dot / (length * length)) * dx;
    ny -= (dot / (length * length)) * dy;

    const normalLength = Math.hypot(nx, ny);

    nx /= normalLength;
    ny /= normalLength;

    const offsetX = nx * roadWidthPx;
    const offsetY = ny * roadWidthPx;

    const roadPolygon = [
      p1,
      p2,
      {
        x: p2.x + offsetX,
        y: p2.y + offsetY
      },
      {
        x: p1.x + offsetX,
        y: p1.y + offsetY
      }
    ];

    const roadPoints = roadPolygon
      .map(p => `${p.x},${p.y}`)
      .join(" ");

    // Centre line of road.

    const halfX = nx * roadWidthPx * 0.5;
    const halfY = ny * roadWidthPx * 0.5;

    return [{
      side,
      roadPoints,
      markings: {
        x1: p1.x + halfX,
        y1: p1.y + halfY,
        x2: p2.x + halfX,
        y2: p2.y + halfY
      }
    }];

  });

  const polygonPoints = transformed
    .map(p => `${p.x},${p.y}`)
    .join(" ");

  // --------------------------------------
  // POINTER DOWN
  // --------------------------------------

  const handlePointerDown = (
    e: PointerEvent<SVGCircleElement>,
    index: number
  ) => {

    e.preventDefault();

    const svg = e.currentTarget.ownerSVGElement;

    if (!svg) return;

    dragSession.current = {

      index,

      startPoints: points.map(p => ({ ...p })),

      startAngle: angle,

      startSides: { ...sides },

      view: { ...view }

    };

    e.currentTarget.setPointerCapture(e.pointerId);

    setDragged(index);

  };

  // --------------------------------------
  // POINTER MOVE
  // --------------------------------------

  const handlePointerMove = (
    e: PointerEvent<SVGSVGElement>
  ) => {

    const session = dragSession.current;

    if (dragged === null || !session) return;

    const svg = e.currentTarget;

    const matrix = svg.getScreenCTM();

    if (!matrix) return;

    // Convert cursor to SVG coordinates.

    const svgPoint = svg.createSVGPoint();

    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;

    const cursor = svgPoint.matrixTransform(
      matrix.inverse()
    );

    // Convert to mathematical coordinates.

    const target: Point = {

      x:
        (cursor.x - session.view.offsetX) /
        session.view.scale +
        session.view.minWorldX,

      y:
        session.view.maxWorldY -
        (cursor.y - session.view.offsetY) /
        session.view.scale

    };

    const original = session.startPoints;

    const A = original[0];

    const index = session.index;

    // ====================================
    // FREE MODE
    // ====================================

    if (!locked) {

      const updated = original.map(p => ({ ...p }));

      updated[index] = target;

      setPoints(updated);

      setSides({

        AB: distance(updated[0], updated[1]),

        BC: distance(updated[1], updated[2]),

        CD: distance(updated[2], updated[3]),

        DA: distance(updated[3], updated[0])

      });

      setError("");

      return;
    }

    // ====================================
    // LOCKED MODE
    // ====================================

    let updated: Point[] | null = null;

    let updatedAngle = session.startAngle;

    // A: Translate entire plot.

    if (index === 0) {

      const dx = target.x - A.x;
      const dy = target.y - A.y;

      updated = translateQuadrilateral(
        original,
        dx,
        dy
      );

    }

    // B: Rotate entire plot.

    else if (index === 1) {

      const originalDirection = Math.atan2(
        original[1].y - A.y,
        original[1].x - A.x
      );

      const targetDirection = Math.atan2(
        target.y - A.y,
        target.x - A.x
      );

      const rotation =
        targetDirection - originalDirection;

      updated = rotateQuadrilateral(
        original,
        rotation,
        A
      );

    }

    // C and D: Change internal shape.

    else if (index === 2 || index === 3) {

      const direction = Math.atan2(
        original[1].y - A.y,
        original[1].x - A.x
      );

      const cos = Math.cos(direction);
      const sin = Math.sin(direction);

      // Convert target to canonical coordinates.

      const dx = target.x - A.x;
      const dy = target.y - A.y;

      const localTarget: Point = {

        x: dx * cos + dy * sin,

        y: -dx * sin + dy * cos

      };

      const result = findClosestConfiguration(
        session.startSides,
        index as 2 | 3,
        localTarget,
        session.startAngle
      );

      if (result) {

        const rotated = rotateQuadrilateral(
          result.points,
          direction,
          { x: 0, y: 0 }
        );

        updated = translateQuadrilateral(
          rotated,
          A.x,
          A.y
        );

        updatedAngle = result.angle;

      }

    }

    if (!updated) return;

    setPoints(updated);

    setAngle(updatedAngle);

    setSides(session.startSides);

    setError("");

  };

  // --------------------------------------
  // POINTER UP
  // --------------------------------------

  const handlePointerUp = () => {

    dragSession.current = null;

    setDragged(null);

  };

  // --------------------------------------
  // RESET
  // --------------------------------------

  const reset = () => {
    setSides(initialSides);
    setAngle(90);

    setPoints(
      generateQuadrilateral(initialSides, 90) || []
    );

    setRoadSides({
      AB: false,
      BC: false,
      CD: false,
      DA: false
    });

    setRoadWidth(6);
    setError("");
  };

  // --------------------------------------
  // EXPORT
  // --------------------------------------

  const handleExport = async () => {
    const svg = document.getElementById("plot-svg");

    if (!svg) {
      setError("Drawing not found.");
      return;
    }

    try {

      const reportLines = [
        "PLOT INFORMATION",
        `Survey Number: ${surveyInfo.surveyNumber}`,
        `Plot Number: ${surveyInfo.plotNumber}`,
        `Area: ${convertArea(area, unit).toFixed(2)} ${unit === "m" ? "m²" : "ft²"}`,
        `Perimeter: ${fromMetres(perimeter, unit).toFixed(2)} ${unit}`,

        "SIDE MEASUREMENTS",

        ...(["AB", "BC", "CD", "DA"] as const).map(
          (side) =>
            `${side}: ${fromMetres(sides[side], unit).toFixed(2)} ${unit} | Bearing: ${surveyInfo.bearings[side]}`
        ),

        "INTERIOR ANGLES",

        `Angle A: ${angles[0].toFixed(2)}°`,
        `Angle B: ${angles[1].toFixed(2)}°`,
        `Angle C: ${angles[2].toFixed(2)}°`,
        `Angle D: ${angles[3].toFixed(2)}°`,

        "DIAGONALS",

        `AC: ${fromMetres(diagonals.AC, unit).toFixed(2)} ${unit}`,
        `BD: ${fromMetres(diagonals.BD, unit).toFixed(2)} ${unit}`,

        "ROAD INFORMATION",

        `Road sides: ${Object.entries(roadSides)
          .filter(([, selected]) => selected)
          .map(([side]) => side)
          .join(", ") || "None"
        }`,

        `Road width: ${fromMetres(roadWidth, unit).toFixed(2)} ${unit}`
      ];

      await downloadSurveyPDF(
        svg as unknown as SVGSVGElement,
        reportLines,
        "Plotrix-Survey.pdf"
      );

      setError("");

    } catch (error) {
      console.error("PDF export failed:", error);
      setError("Unable to export PDF. Please try again.");
    }
  };

  // ======================================
  // RENDER
  // ======================================

  return (

    <div className="app">

      {/* HEADER */}

      <header className="topbar">

        <div className="brand">

          <span className="brand-icon">P</span>

          <span>plotrix</span>

        </div>

        <div className="header-actions">

          <button onClick={reset}>

            <RotateCcw size={16} />

            Reset

          </button>

          <button
            className="export"
            onClick={handleExport}
          >

            <Download size={16} />

            Export PDF

          </button>

        </div>

      </header>

      {/* WORKSPACE */}

      <main className="workspace">

        {/* LEFT PANEL */}

        <aside className="panel">

          <h3>Land dimensions</h3>

          <p className="subtitle">
            Enter the measurements of your plot.
          </p>

          {/* UNIT SELECTOR */}

          <div className="unit-selector">

            <label>Measurement unit</label>

            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
            >

              <option value="m">Metres (m)</option>

              <option value="ft">Feet (ft)</option>

            </select>

          </div>

          {/* SIDE INPUTS */}

          <div className="input-list">

            {(Object.keys(sides) as (keyof Sides)[]).map(key => (

              <div className="input-group" key={key}>

                <label>Side {key}</label>

                <div className="input-wrapper">

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={Number(
                      fromMetres(sides[key], unit).toFixed(2)
                    )}
                    onChange={e =>
                      updateSides(
                        key,
                        toMetres(Number(e.target.value), unit)
                      )
                    }
                  />

                  <span>{unit}</span>

                </div>

              </div>

            ))}

          </div>

          <div className="divider" />
          {/* ROAD CONFIGURATION */}

          <div className="road-section">

            <div className="road-heading">
              <h3>Road configuration</h3>
              <span>{selectedRoadCount} selected</span>
            </div>

            <p className="subtitle">
              Select the sides adjoining a road.
            </p>

            <div className="road-options">

              {(Object.keys(roadSides) as (keyof typeof roadSides)[]).map(side => (

                <button
                  key={side}
                  className={`road-option ${roadSides[side] ? "active" : ""}`}
                  onClick={() => toggleRoad(side)}
                >
                  <span>{side}</span>

                  <span className="road-switch">
                    {roadSides[side] ? "ON" : "OFF"}
                  </span>
                </button>

              ))}

            </div>

            <div className="road-width">

              <label>Road width</label>

              <div className="input-wrapper">

                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={Number(fromMetres(roadWidth, unit).toFixed(2))}
                  onChange={e => updateRoadWidth(Number(e.target.value))}
                />

                <span>{unit}</span>

              </div>

            </div>

            {selectedRoadCount > 0 && (

              <div className="road-summary">
                {selectedRoadCount} road{selectedRoadCount > 1 ? "s" : ""} added to your plot.
              </div>

            )}

          </div>

          <div className="divider" />

          {/* SURVEY DETAILS */}

          <div className="survey-section">

            <h3>Survey information</h3>

            <p className="subtitle">
              Enter property and neighbouring survey details.
            </p>

            <div className="input-group">
              <label>Survey number</label>

              <input
                type="text"
                value={surveyInfo.surveyNumber}
                onChange={e =>
                  updateSurveyField("surveyNumber", e.target.value)
                }
                placeholder="e.g. 125/1"
              />
            </div>

            <div className="input-group">
              <label>Plot number</label>

              <input
                type="text"
                value={surveyInfo.plotNumber}
                onChange={e =>
                  updateSurveyField("plotNumber", e.target.value)
                }
                placeholder="e.g. 125/1"
              />
            </div>

            <h4>Boundary information</h4>

            {(Object.keys(sides) as (keyof Sides)[]).map(side => (

              <div className="survey-boundary-input" key={side}>

                <strong>{side}</strong>

                <div className="input-group">
                  <label>Neighbouring survey number</label>

                  <input
                    type="text"
                    value={surveyInfo.adjacentPlots[side]}
                    onChange={e =>
                      updateAdjacentPlot(side, e.target.value)
                    }
                    placeholder="e.g. 125/2"
                  />
                </div>

                <div className="input-group">
                  <label>Bearing</label>

                  <input
                    type="text"
                    value={surveyInfo.bearings[side]}
                    onChange={e =>
                      updateBearing(side, e.target.value)
                    }
                    placeholder="e.g. N 87° 15' E"
                  />
                </div>

                <div className="input-group">
                  <label>Road name (optional)</label>

                  <input
                    type="text"
                    value={surveyInfo.roadNames[side]}
                    onChange={e =>
                      updateRoadName(side, e.target.value)
                    }
                    placeholder="e.g. Village Road"
                  />
                </div>

              </div>

            ))}

          </div>

          {/* EDITING MODE */}

          <div className="mode-heading">

            <h3>Editing mode</h3>

            <button
              className="icon-button"
              onClick={() => setLocked(!locked)}
            >

              {locked
                ? <Lock size={17} />
                : <Unlock size={17} />
              }

            </button>

          </div>

          <div className="mode-card">

            {locked
              ? "Dimensions locked"
              : "Free movement"
            }

            <p>

              {locked
                ? "A: Move plot. B: Rotate. C and D: Reshape while preserving all side lengths."
                : "Drag any corner freely. Side lengths update automatically."
              }

            </p>

          </div>

          {/* ANGLE CONTROL */}

          {locked && (

            <div className="angle-control">

              <label>Initial shape angle</label>

              {angleRange && (

                <>

                  <input
                    type="range"
                    min={angleRange.min}
                    max={angleRange.max}
                    step="0.01"
                    value={angle}
                    onChange={e =>
                      updateAngle(Number(e.target.value))
                    }
                  />

                  <div className="angle-value">

                    <input
                      type="number"
                      min={angleRange.min}
                      max={angleRange.max}
                      step="0.01"
                      value={Number(angle.toFixed(2))}
                      onChange={e =>
                        updateAngle(Number(e.target.value))
                      }
                    />

                    <span>°</span>

                  </div>

                  <small>

                    Valid range: {angleRange.min.toFixed(2)}°
                    to {angleRange.max.toFixed(2)}°

                  </small>

                </>

              )}

            </div>

          )}

          {(error || dimensionError) && (

            <p className="error">
              {error || dimensionError}
            </p>

          )}

        </aside>

        {/* MAIN CANVAS */}

        <section className="canvas-section">

          <div className="canvas-toolbar">

            <div>

              <Move size={15} />

              <span>Drag corners to edit</span>

            </div>

            <button
              onClick={() => setShowGrid(!showGrid)}
            >

              <Grid3X3 size={16} />

              Grid

            </button>

          </div>

          <div className="canvas-container">

            <svg
              id="plot-svg"
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
            >

              {/* GRID */}

              {showGrid && (

                <defs>

                  <pattern
                    id="grid"
                    width="35"
                    height="35"
                    patternUnits="userSpaceOnUse"
                  >

                    <path
                      d="M 35 0 L 0 0 0 35"
                      fill="none"
                      stroke="#eeeeea"
                      strokeWidth="1"
                    />

                  </pattern>

                </defs>

              )}

              {showGrid && (

                <rect
                  width="100%"
                  height="100%"
                  fill="url(#grid)"
                />

              )}
              {/* SURVEY MAP HEADING */}

              <g pointerEvents="none">



                <text
                  x={SVG_WIDTH - 35}
                  y="35"
                  textAnchor="end"
                  fontFamily="Ranade, sans-serif"
                  fontSize="13"
                  fontStyle="italic"
                  fill="#222222"
                >
                  SURVEY No. {surveyInfo.surveyNumber}
                </text>

              </g>
              {/* ROADS */}

              {roads.map(road => (

                <g key={road.side}>

                  {/* Asphalt surface */}

                  <polygon
                    points={road.roadPoints}
                    fill="#686868"
                    stroke="#171717"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />

                  {/* Dashed road markings */}

                  <line
                    x1={road.markings.x1}
                    y1={road.markings.y1}
                    x2={road.markings.x2}
                    y2={road.markings.y2}
                    stroke="#ffffff"
                    strokeWidth="5"
                    strokeDasharray="18 14"
                    strokeLinecap="butt"
                  />

                </g>

              ))}

              {/* LAND POLYGON */}

              <polygon
                points={polygonPoints}
                fill="#999f59"
                stroke="#252525"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />

              {/* SURVEY BOUNDARY ANNOTATIONS */}

              {points.map((point, i) => {

                const next = points[(i + 1) % 4];

                const p1 = transformed[i];
                const p2 = transformed[(i + 1) % 4];

                const side = (["AB", "BC", "CD", "DA"] as const)[i];

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;

                const length = Math.hypot(dx, dy);

                if (length === 0) return null;

                const ux = dx / length;
                const uy = dy / length;

                // Outward normal
                let nx = -uy;
                let ny = ux;

                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                const centerX =
                  transformed.reduce((sum, p) => sum + p.x, 0) / 4;

                const centerY =
                  transformed.reduce((sum, p) => sum + p.y, 0) / 4;

                if (
                  nx * (midX - centerX) +
                  ny * (midY - centerY) < 0
                ) {
                  nx *= -1;
                  ny *= -1;
                }

                const roadAttached = roadSides[side];

                // Keep annotations inside the plot if road occupies the outside.
                const direction = roadAttached ? -1 : 1;

                const offset = 30 * direction;

                const labelX = midX + nx * offset;
                const labelY = midY + ny * offset;

                // Keep text readable regardless of side direction.
                let rotation =
                  Math.atan2(dy, dx) * 180 / Math.PI;

                if (rotation > 90 || rotation < -90) {
                  rotation += rotation > 90 ? -180 : 180;
                }

                const bearing = surveyInfo.bearings[side];

                const adjacentPlot = surveyInfo.adjacentPlots[side];

                const roadName = surveyInfo.roadNames[side];

                const displayLength = fromMetres(
                  distance(point, next),
                  unit
                );

                const textTransform =
                  `rotate(${rotation}, ${labelX}, ${labelY})`;

                return (

                  <g key={side} pointerEvents="none">

                    {/* BEARING */}

                    <text
                      x={labelX}
                      y={labelY - 9}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="14"
                      fontStyle="italic"
                      fill="#222222"
                      transform={textTransform}
                    >
                      {bearing}
                    </text>

                    {/* SIDE LENGTH */}

                    <text
                      x={labelX}
                      y={labelY + 12}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="13"
                      fill="#222222"
                      transform={textTransform}
                    >
                      {displayLength.toFixed(2)}
                    </text>

                    {/* NEIGHBOURING SURVEY NUMBER */}

                    {adjacentPlot && (() => {

                      const neighbourOffset = roadAttached
                        ? roadWidthPx + 38
                        : 78;

                      const neighbourX = midX + nx * neighbourOffset;
                      const neighbourY = midY + ny * neighbourOffset;

                      return (
                        <text
                          x={neighbourX}
                          y={neighbourY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontFamily="Ranade, sans-serif"
                          fontSize="17"
                          fontStyle="italic"
                          fill="#252525"
                        >
                          {adjacentPlot}
                        </text>
                      );

                    })()}

                    {/* ROAD NAME */}

                    {roadAttached && roadName && (() => {

                      // Position the name inside the road surface.
                      const roadNameOffset = roadWidthPx * 0.78;

                      const roadLabelX = midX + nx * roadNameOffset;
                      const roadLabelY = midY + ny * roadNameOffset;

                      return (
                        <text
                          x={roadLabelX}
                          y={roadLabelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontFamily="Ranade, sans-serif"
                          fontSize="14"
                          fontStyle="italic"
                          fill="#222222"
                          transform={`rotate(${rotation}, ${roadLabelX}, ${roadLabelY})`}
                        >
                          {roadName.toUpperCase()}
                        </text>
                      );

                    })()}

                  </g>

                );

              })}

              {/* CORNER HANDLES */}

              {transformed.map((p, i) => (

                <g key={i}>

                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="12"
                    fill="transparent"
                    style={{
                      cursor: dragged === i ? "grabbing" : "grab",
                      touchAction: "none"
                    }}
                    onPointerDown={e =>
                      handlePointerDown(e, i)
                    }
                  />

                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="6"
                    fill="#ffffff"
                    stroke="#292929"
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                  <text
                    x={p.x + 10}
                    y={p.y - 10}
                    fontSize="11"
                    fontFamily="Ranade, sans-serif"
                    fontStyle="italic"
                    fill="#222222"
                    pointerEvents="none"
                  >
                    {labels[i]}
                  </text>

                </g>


              ))}

              {/* CENTRAL PLOT INFORMATION */}

              {(() => {

                const centerX =
                  transformed.reduce((sum, p) => sum + p.x, 0) / 4;

                const centerY =
                  transformed.reduce((sum, p) => sum + p.y, 0) / 4;

                return (

                  <g pointerEvents="none">

                    <text
                      x={centerX}
                      y={centerY - 8}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="34"
                      fontStyle="italic"
                      fill="#222222"
                    >
                      {surveyInfo.plotNumber}
                    </text>

                    <text
                      x={centerX}
                      y={centerY + 28}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="20"
                      fontStyle="italic"
                      fill="#222222"
                    >
                      {convertArea(area, unit).toFixed(2)}
                      {" "}
                      {unit === "m" ? "m²" : "ft²"}
                    </text>

                  </g>

                );

              })()}


              {/* COMPASS */}

              <g
                transform={`translate(${SVG_WIDTH - 80}, 100)`}
                pointerEvents="none"
              >

                <circle
                  r="30"
                  fill="white"
                  stroke="#555"
                />

                <path
                  d="M0 -24 L8 12 L0 5 L-8 12 Z"
                  fill="#333"
                />

                <text
                  x="0"
                  y="-38"
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="bold"
                >

                  N

                </text>

              </g>

            </svg>

          </div>

        </section>

        {/* RIGHT PANEL */}

        <aside className="panel results">

          <h3>Plot information</h3>

          <p className="subtitle">
            Live geometric calculations.
          </p>

          {/* AREA */}

          <div className="result-card">

            <span>Total area</span>

            <strong>
              {convertArea(area, unit).toFixed(2)}
            </strong>

            <small>
              {unit === "m" ? "m²" : "ft²"}
            </small>

          </div>

          {/* PERIMETER */}

          <div className="result-card">

            <span>Perimeter</span>

            <strong>
              {fromMetres(perimeter, unit).toFixed(2)}
            </strong>

            <small>{unit}</small>

          </div>

          <div className="divider" />

          {/* ANGLES */}

          <h4>Interior angles</h4>

          <div className="measure-list">

            {angles.map((value, i) => (

              <div key={i}>

                <span>Angle {labels[i]}</span>

                <strong>{value.toFixed(2)}°</strong>

              </div>

            ))}

          </div>

          <div className="divider" />

          {/* DIAGONALS */}

          <h4>Diagonals</h4>

          <div className="measure-list">

            <div>

              <span>AC</span>

              <strong>
                {fromMetres(diagonals.AC, unit).toFixed(2)} {unit}
              </strong>

            </div>

            <div>

              <span>BD</span>

              <strong>
                {fromMetres(diagonals.BD, unit).toFixed(2)} {unit}
              </strong>

            </div>

          </div>

          <div className="compass-info">

            <Compass size={18} />

            North ↑

          </div>

        </aside>

      </main>

      <footer>
        Plotrix · Mathematical Land Mapping
      </footer>

    </div>

  );

}

export default App;