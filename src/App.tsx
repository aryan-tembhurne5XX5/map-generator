import { useState, useRef } from "react";
import type { PointerEvent } from "react";
import { downloadSurveyPDF } from "./utils/exportSurvey";
import { wrapText, fitFontSize } from "./utils/svgText";

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
// TEXT LAYOUT & GEOMETRY HELPERS
// ========================================

function wrapWords(
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  if (!text.trim()) return [];
  const approximateCharWidth = fontSize * 0.55;
  const maxChars = Math.max(
    1,
    Math.floor(maxWidth / approximateCharWidth)
  );

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function getQuadCenter(pts: Point[]): Point {
  const [p0, p1, p2, p3] = pts;
  const denom = (p0.x - p2.x) * (p1.y - p3.y) - (p0.y - p2.y) * (p1.x - p3.x);
  if (Math.abs(denom) > 1e-4) {
    const t = ((p0.x - p1.x) * (p1.y - p3.y) - (p0.y - p1.y) * (p1.x - p3.x)) / denom;
    if (t > 0.05 && t < 0.95) {
      return {
        x: p0.x + t * (p2.x - p0.x),
        y: p0.y + t * (p2.y - p0.y)
      };
    }
  }
  return {
    x: (p0.x + p1.x + p2.x + p3.x) / 4,
    y: (p0.y + p1.y + p2.y + p3.y) / 4
  };
}

function getInnerHorizontalSpan(pts: Point[], cy: number): number {
  const xs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    if ((a.y <= cy && b.y >= cy) || (b.y <= cy && a.y >= cy)) {
      if (Math.abs(b.y - a.y) > 1e-4) {
        const x = a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x);
        xs.push(x);
      }
    }
  }
  if (xs.length >= 2) {
    xs.sort((a, b) => a - b);
    return Math.max(40, xs[xs.length - 1] - xs[0]);
  }
  return 100;
}

function getInnerVerticalSpan(pts: Point[], cx: number): number {
  const ys: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    if ((a.x <= cx && b.x >= cx) || (b.x <= cx && a.x >= cx)) {
      if (Math.abs(b.x - a.x) > 1e-4) {
        const y = a.y + ((cx - a.x) / (b.x - a.x)) * (b.y - a.y);
        ys.push(y);
      }
    }
  }
  if (ys.length >= 2) {
    ys.sort((a, b) => a - b);
    return Math.max(40, ys[ys.length - 1] - ys[0]);
  }
  return 100;
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

  const [plotColor, setPlotColor] = useState("#999f59");

  const [roadSides, setRoadSides] = useState({
    AB: false,
    BC: false,
    CD: false,
    DA: false
  });

  const [roadWidths, setRoadWidths] = useState({
    AB: 6,
    BC: 6,
    CD: 6,
    DA: 6
  });
  const toggleRoad = (side: keyof typeof roadSides) => {
    setRoadSides(prev => ({
      ...prev,
      [side]: !prev[side]
    }));
  };

  const updateRoadWidth = (
    side: keyof typeof roadWidths,
    value: number
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;

    setRoadWidths(prev => ({
      ...prev,
      [side]: toMetres(value, unit)
    }));
  };
  // SURVEY INFORMATION

  const [mapTitle, setMapTitle] = useState("RE-SURVEY MAP");
  const [mapSubtitle, setMapSubtitle] = useState("(Updated Survey Boundaries and Measurements)");

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
  // DYNAMIC HEADER MEASUREMENT & RESERVATION
  // --------------------------------------

  const headingText = surveyInfo.surveyNumber.trim();
  const maxHeaderWidth = SVG_WIDTH - 240;
  const headerFontSize = fitFontSize(headingText, maxHeaderWidth, 18, 14);
  const headerLines = wrapText(
    headingText,
    Math.max(15, Math.floor(maxHeaderWidth / (headerFontSize * 0.58)))
  );

  const headerLineHeight = headerFontSize * 1.35;
  const headerTextTop = 26;
  const headerTextBottom = headerLines.length > 0
    ? headerTextTop + (headerLines.length - 1) * headerLineHeight + headerFontSize
    : 20;

  // Reserved space for header with a clean margin
  const HEADER_SPACE = Math.max(75, headerTextBottom + 25);
  const BOTTOM_SPACE = 35;
  const HORIZONTAL_MARGIN = 55;

  // --------------------------------------
  // SVG COORDINATE TRANSFORMATION
  // --------------------------------------

  // Extended world bounds including quadrilateral, roads, and annotation lanes
  const extWorldPoints: Point[] = [...points];

  const worldCenterX = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const worldCenterY = points.reduce((sum, p) => sum + p.y, 0) / 4;

  points.forEach((p1, i) => {
    const p2 = points[(i + 1) % 4];
    const side = (["AB", "BC", "CD", "DA"] as const)[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    let nx = -(dy / len);
    let ny = dx / len;
    if (nx * (midX - worldCenterX) + ny * (midY - worldCenterY) < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Outward reach in world units: road width + annotation margin
    const roadWidthWorld = roadSides[side] ? roadWidths[side] : 0;
    const annotMarginWorld = roadSides[side] ? 2.5 : 4.0;
    const totalOutward = roadWidthWorld + annotMarginWorld;

    extWorldPoints.push(
      { x: p1.x + nx * totalOutward, y: p1.y + ny * totalOutward },
      { x: p2.x + nx * totalOutward, y: p2.y + ny * totalOutward }
    );
  });

  const minExtX = Math.min(...extWorldPoints.map(p => p.x));
  const maxExtX = Math.max(...extWorldPoints.map(p => p.x));
  const minExtY = Math.min(...extWorldPoints.map(p => p.y));
  const maxExtY = Math.max(...extWorldPoints.map(p => p.y));

  const extWorldWidth = Math.max(maxExtX - minExtX, 1);
  const extWorldHeight = Math.max(maxExtY - minExtY, 1);

  const availableMapWidth = SVG_WIDTH - 2 * HORIZONTAL_MARGIN;
  const availableMapHeight = SVG_HEIGHT - HEADER_SPACE - BOTTOM_SPACE;

  const calculatedScale = Math.min(
    availableMapWidth / extWorldWidth,
    availableMapHeight / extWorldHeight
  );

  const minWorldX = Math.min(...points.map(p => p.x));
  const maxWorldY = Math.max(...points.map(p => p.y));

  const calculatedOffsetX =
    HORIZONTAL_MARGIN +
    (availableMapWidth - extWorldWidth * calculatedScale) / 2 +
    (minWorldX - minExtX) * calculatedScale;

  const calculatedOffsetY =
    HEADER_SPACE +
    (availableMapHeight - extWorldHeight * calculatedScale) / 2 +
    (maxExtY - maxWorldY) * calculatedScale;

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

  const roads = transformed.flatMap((p1, i) => {

    const side = (["AB", "BC", "CD", "DA"] as const)[i];

    if (!roadSides[side]) return [];

    const roadWidthPx = roadWidths[side] * view.scale;

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

    setRoadWidths({
      AB: 6,
      BC: 6,
      CD: 6,
      DA: 6
    });
    setError("");
  };

  // --------------------------------------
  // EXPORT
  // --------------------------------------

  const [showOrientationModal, setShowOrientationModal] = useState(false);

  const handleExport = () => {
    setShowOrientationModal(true);
  };

  const runExport = async (orientation: "landscape" | "portrait") => {
    setShowOrientationModal(false);

    const svg = document.getElementById("plot-svg");

    if (!svg) {
      setError("Drawing not found.");
      return;
    }

    try {

      const reportLines = [
        "PLOT INFORMATION",
        `Information: ${surveyInfo.surveyNumber}`,
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

        ...(["AB", "BC", "CD", "DA"] as const)
          .filter(side => roadSides[side])
          .map(side =>
            `Road ${side} width: ${fromMetres(roadWidths[side], unit).toFixed(2)} ${unit}`
          )
      ];

      await downloadSurveyPDF(
        svg as unknown as SVGSVGElement,
        reportLines,
        "Plotrix-Survey.pdf",
        mapTitle,
        mapSubtitle,
        orientation
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

      {/* ORIENTATION MODAL */}

      {showOrientationModal && (
        <div className="orientation-overlay" onClick={() => setShowOrientationModal(false)}>
          <div className="orientation-modal" onClick={e => e.stopPropagation()}>

            <h3>Choose page orientation</h3>

            <p>Select the orientation for your exported PDF.</p>

            <div className="orientation-options">

              <button
                className="orientation-btn"
                onClick={() => runExport("landscape")}
              >
                <span className="orientation-icon orientation-landscape" />
                Landscape
              </button>

              <button
                className="orientation-btn"
                onClick={() => runExport("portrait")}
              >
                <span className="orientation-icon orientation-portrait" />
                Portrait
              </button>

            </div>

            <button
              className="orientation-cancel"
              onClick={() => setShowOrientationModal(false)}
            >
              Cancel
            </button>

          </div>
        </div>
      )}

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

          <div className="divider" />

          <div className="color-section">
            <h3>Plot appearance</h3>
            <p className="subtitle">Customize the land colour.</p>

            <div className="color-picker-row">
              <label htmlFor="plot-color">Plot colour</label>

              <div className="color-picker-control">
                <input
                  id="plot-color"
                  type="color"
                  value={plotColor}
                  onChange={e => setPlotColor(e.target.value)}
                />

                <span>{plotColor.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="divider" />

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

                <div key={side} className="road-option-wrapper">

                  <button
                    className={`road-option ${roadSides[side] ? "active" : ""}`}
                    onClick={() => toggleRoad(side)}
                  >
                    <span>{side}</span>

                    <span className="road-switch">
                      {roadSides[side] ? "ON" : "OFF"}
                    </span>
                  </button>

                  {roadSides[side] && (

                    <div className="road-width">

                      <label>Road width · {side}</label>

                      <div className="input-wrapper">

                        <input
                          type="number"
                          min="0.1"
                          step="0.5"
                          value={Number(
                            fromMetres(roadWidths[side], unit).toFixed(2)
                          )}
                          onChange={e =>
                            updateRoadWidth(side, Number(e.target.value))
                          }
                        />

                        <span>{unit}</span>

                      </div>

                    </div>

                  )}

                </div>

              ))}

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
              <label>Map title</label>

              <input
                type="text"
                value={mapTitle}
                onChange={e => setMapTitle(e.target.value)}
                placeholder="e.g. RE-SURVEY MAP"
              />
            </div>

            <div className="input-group">
              <label>Map subtitle</label>

              <input
                type="text"
                value={mapSubtitle}
                onChange={e => setMapSubtitle(e.target.value)}
                placeholder="e.g. (Updated Survey Boundaries and Measurements)"
              />
            </div>

            <div className="input-group">
              <label>Information</label>

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

              {headerLines.length > 0 && (
                <g pointerEvents="none">
                  {headerLines.map((line, i) => (
                    <text
                      key={i}
                      x={SVG_WIDTH / 2}
                      y={headerTextTop + i * headerLineHeight}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize={headerFontSize}
                      fontStyle="italic"
                      fill="#222222"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              )}
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

              {/* CLIP GRID TO PLOT */}
              <defs>
                <clipPath id="plotClip">
                  <polygon points={polygonPoints} />
                </clipPath>
              </defs>

              {/* LAND POLYGON */}

              <polygon
                points={polygonPoints}
                fill={plotColor}
                stroke="#252525"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />

              {/* GRID INSIDE PLOT */}
              <g clipPath="url(#plotClip)" pointerEvents="none">

                <defs>
                  <pattern
                    id="plotGrid"
                    width="25"
                    height="25"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 25 0 L 0 0 0 25"
                      fill="none"
                      stroke="#333333"
                      strokeWidth="0.6"
                      opacity="0.5"
                    />
                  </pattern>
                </defs>

                <rect
                  x="0"
                  y="0"
                  width={SVG_WIDTH}
                  height={SVG_HEIGHT}
                  fill="url(#plotGrid)"
                />

              </g>

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

                const polygonCenterX =
                  transformed.reduce((sum, p) => sum + p.x, 0) / 4;

                const polygonCenterY =
                  transformed.reduce((sum, p) => sum + p.y, 0) / 4;

                if (
                  nx * (midX - polygonCenterX) +
                  ny * (midY - polygonCenterY) < 0
                ) {
                  nx *= -1;
                  ny *= -1;
                }

                const roadAttached = roadSides[side];

                const bearing = surveyInfo.bearings[side];
                const adjacentPlot = surveyInfo.adjacentPlots[side];
                const roadName = surveyInfo.roadNames[side];

                const displayLength = fromMetres(
                  distance(point, next),
                  unit
                );

                // Separate annotation lanes using the perpendicular normal.
                // When road is attached: bearing & length sit just inside the boundary line.
                // When road is NOT attached: bearing & length sit just outside the boundary line.
                const bearingOffset = roadAttached ? -12 : 14;
                const lengthOffset = roadAttached ? -24 : 26;

                const bearingX = midX + nx * bearingOffset;
                const bearingY = midY + ny * bearingOffset;

                const lengthX = midX + nx * lengthOffset;
                const lengthY = midY + ny * lengthOffset;

                // Normalize rotation.
                let rotation =
                  Math.atan2(dy, dx) * 180 / Math.PI;

                if (rotation > 90 || rotation < -90) {
                  rotation += rotation > 90 ? -180 : 180;
                }

                // Neighbour text is placed outside the road (if attached) or outside length (if not).
                const sideRoadWidthPx = roadAttached
                  ? roadWidths[side] * view.scale
                  : 0;

                const neighbourOffset = roadAttached
                  ? sideRoadWidthPx + 20
                  : 44;

                const neighbourX = midX + nx * neighbourOffset;
                const neighbourY = midY + ny * neighbourOffset;

                // Allow long neighbouring names to shrink.
                const neighbourFontSize = fitFontSize(
                  adjacentPlot,
                  length * 0.9,
                  13,
                  8
                );

                // Road label placed centered in the road.
                const roadNameOffset = roadAttached
                  ? sideRoadWidthPx * 0.7
                  : 0;

                const roadLabelX = midX + nx * roadNameOffset;
                const roadLabelY = midY + ny * roadNameOffset;

                return (

                  <g key={side} pointerEvents="none">

                    {/* BEARING */}

                    <text
                      x={bearingX}
                      y={bearingY}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="13"
                      fontStyle="italic"
                      fill="#222222"
                      transform={`rotate(${rotation}, ${bearingX}, ${bearingY})`}
                    >
                      {bearing}
                    </text>

                    {/* SIDE LENGTH */}

                    <text
                      x={lengthX}
                      y={lengthY}
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize="13"
                      fill="#222222"
                      transform={`rotate(${rotation}, ${lengthX}, ${lengthY})`}
                    >
                      {displayLength.toFixed(2)}
                    </text>

                    {/* NEIGHBOURING PROPERTY */}

                    {adjacentPlot && (

                      <text
                        x={neighbourX}
                        y={neighbourY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="Ranade, sans-serif"
                        fontSize={neighbourFontSize}
                        fontStyle="italic"
                        fill="#252525"
                        transform={`rotate(${rotation}, ${neighbourX}, ${neighbourY})`}
                      >
                        {adjacentPlot}
                      </text>

                    )}

                    {/* ROAD NAME */}

                    {roadAttached && roadName && (

                      <text
                        x={roadLabelX}
                        y={roadLabelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="Ranade, sans-serif"
                        fontSize="12"
                        fontStyle="italic"
                        fill="#ffffff"
                        transform={`rotate(${rotation}, ${roadLabelX}, ${roadLabelY})`}
                      >
                        {roadName.toUpperCase()}
                      </text>

                    )}

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

                const center = getQuadCenter(transformed);

                // Calculate horizontal and vertical clearances around the center
                const horizSpanMid = getInnerHorizontalSpan(transformed, center.y);
                const vertSpanMid = getInnerVerticalSpan(transformed, center.x);

                const horizSpanTop = getInnerHorizontalSpan(
                  transformed,
                  center.y - vertSpanMid * 0.22
                );
                const horizSpanBottom = getInnerHorizontalSpan(
                  transformed,
                  center.y + vertSpanMid * 0.22
                );
                const effHorizSpan = Math.min(
                  horizSpanMid,
                  horizSpanTop,
                  horizSpanBottom
                );

                const vertSpanLeft = getInnerVerticalSpan(
                  transformed,
                  center.x - effHorizSpan * 0.22
                );
                const vertSpanRight = getInnerVerticalSpan(
                  transformed,
                  center.x + effHorizSpan * 0.22
                );
                const effVertSpan = Math.min(
                  vertSpanMid,
                  vertSpanLeft,
                  vertSpanRight
                );

                // Usable dimensions adapting dynamically to the quadrilateral's true interior space
                const usableWidth = Math.max(60, effHorizSpan * 0.82);

                const hasRoad = Object.values(roadSides).some(Boolean);
                const vertSafety = hasRoad ? 0.70 : 0.76;
                const usableHeight = Math.max(45, effVertSpan * vertSafety);

                const areaText = `${convertArea(area, unit).toFixed(2)} ${unit === "m" ? "m²" : "ft²"}`;
                const areaFontSize = Math.min(15, Math.max(10, usableHeight * 0.16));
                const gap = Math.min(10, Math.max(4, usableHeight * 0.08));
                const availableForPlot = Math.max(20, usableHeight - areaFontSize - gap);

                const plotText = surveyInfo.plotNumber.trim();

                let fittedFontSize = 10;
                let lines: string[] = [plotText];

                if (plotText) {
                  const maxFontSize = Math.min(26, Math.max(12, usableHeight * 0.26));
                  const minFontSize = 9.5;

                  for (let fs = maxFontSize; fs >= minFontSize; fs -= 0.5) {
                    const candidateLines = wrapWords(plotText, usableWidth, fs);
                    const candidateHeight = candidateLines.length * (fs * 1.28);
                    if (candidateHeight <= availableForPlot) {
                      fittedFontSize = fs;
                      lines = candidateLines;
                      break;
                    }
                    fittedFontSize = fs;
                    lines = candidateLines;
                  }

                  const minLineHeight = fittedFontSize * 1.25;
                  if (lines.length * minLineHeight > availableForPlot) {
                    fittedFontSize = Math.max(8.5, availableForPlot / (lines.length * 1.25));
                  }
                } else {
                  lines = [];
                }

                const lineHeight = fittedFontSize * 1.28;
                const plotBlockHeight = lines.length * lineHeight;
                const totalBlockHeight =
                  plotBlockHeight + (lines.length > 0 ? gap : 0) + areaFontSize;
                const startY = center.y - totalBlockHeight / 2;

                return (

                  <g pointerEvents="none">

                    {/* Plot number / description */}

                    {lines.map((line, i) => (
                      <text
                        key={i}
                        x={center.x}
                        y={startY + (i + 0.82) * lineHeight}
                        textAnchor="middle"
                        fontFamily="Ranade, sans-serif"
                        fontSize={fittedFontSize}
                        fontStyle="italic"
                        fill="#222222"
                      >
                        {line}
                      </text>
                    ))}

                    {/* Area measurement - strictly separated below plot text */}

                    <text
                      x={center.x}
                      y={
                        startY +
                        plotBlockHeight +
                        (lines.length > 0 ? gap : 0) +
                        areaFontSize * 0.85
                      }
                      textAnchor="middle"
                      fontFamily="Ranade, sans-serif"
                      fontSize={areaFontSize}
                      fontStyle="italic"
                      fill="#222222"
                    >
                      {areaText}
                    </text>

                  </g>

                );

              })()}


              {/* COMPASS */}

              <g
                transform={`translate(${SVG_WIDTH - 80}, 145)`}
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