export type Point = {
    x: number;
    y: number;
};

export type Sides = {
    AB: number;
    BC: number;
    CD: number;
    DA: number;
};

export type AngleRange = {
    min: number;
    max: number;
};

export type GeometryResult = {
    points: Point[];
    angle: number;
};

// ========================================
// BASIC GEOMETRY
// ========================================

export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function cross(a: Point, b: Point, c: Point): number {
    return (
        (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x)
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

// ========================================
// DIMENSION VALIDATION
// ========================================

export function validateSideLengths(
    sides: Sides
): string | null {

    const lengths = Object.values(sides);

    if (
        lengths.some(
            value => !Number.isFinite(value) || value <= 0
        )
    ) {
        return "All side lengths must be positive numbers.";
    }

    const sorted = [...lengths].sort((a, b) => a - b);

    if (sorted[3] >= sorted[0] + sorted[1] + sorted[2]) {
        return "These lengths cannot form a quadrilateral.";
    }

    return null;
}

// ========================================
// CIRCLE INTERSECTIONS
// ========================================

export function circleIntersections(
    p1: Point,
    r1: number,
    p2: Point,
    r2: number
): Point[] {

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const d = Math.hypot(dx, dy);

    const epsilon = 1e-9;

    if (
        d < epsilon ||
        d > r1 + r2 + epsilon ||
        d < Math.abs(r1 - r2) - epsilon
    ) {
        return [];
    }

    const a =
        (r1 * r1 - r2 * r2 + d * d) / (2 * d);

    const hSquared = r1 * r1 - a * a;

    if (hSquared < -epsilon) return [];

    const h = Math.sqrt(Math.max(0, hSquared));

    const x = p1.x + (a * dx) / d;
    const y = p1.y + (a * dy) / d;

    const rx = (-dy * h) / d;
    const ry = (dx * h) / d;

    const first = {
        x: x + rx,
        y: y + ry
    };

    const second = {
        x: x - rx,
        y: y - ry
    };

    if (h < epsilon) return [first];

    return [first, second];
}

// ========================================
// VALID ANGLE RANGE
// ========================================

export function getValidAngleRange(
    sides: Sides
): AngleRange | null {

    if (validateSideLengths(sides)) return null;

    const { AB, BC, CD, DA } = sides;

    const lowerDistance = Math.max(
        Math.abs(AB - DA),
        Math.abs(BC - CD)
    );

    const upperDistance = Math.min(
        AB + DA,
        BC + CD
    );

    if (lowerDistance >= upperDistance) return null;

    const calculateAngle = (diagonal: number) => {

        const cosine =
            (
                AB * AB +
                DA * DA -
                diagonal * diagonal
            ) / (2 * AB * DA);

        return Math.acos(
            clamp(cosine, -1, 1)
        ) * 180 / Math.PI;
    };

    const margin = 0.05;

    const min = calculateAngle(lowerDistance) + margin;
    const max = calculateAngle(upperDistance) - margin;

    if (min >= max) return null;

    return { min, max };
}

// ========================================
// POLYGON CALCULATIONS
// ========================================

export function calculateArea(points: Point[]): number {

    if (points.length !== 4) return 0;

    let sum = 0;

    for (let i = 0; i < points.length; i++) {

        const current = points[i];
        const next = points[(i + 1) % points.length];

        sum +=
            current.x * next.y -
            next.x * current.y;
    }

    return Math.abs(sum) / 2;
}

export function isConvex(points: Point[]): boolean {

    if (points.length !== 4) return false;

    let direction = 0;

    for (let i = 0; i < 4; i++) {

        const value = cross(
            points[i],
            points[(i + 1) % 4],
            points[(i + 2) % 4]
        );

        if (Math.abs(value) < 1e-9) return false;

        const currentDirection = Math.sign(value);

        if (direction === 0) {
            direction = currentDirection;
        } else if (direction !== currentDirection) {
            return false;
        }
    }

    return true;
}

function segmentsIntersect(
    a: Point,
    b: Point,
    c: Point,
    d: Point
): boolean {

    const o1 = cross(a, b, c);
    const o2 = cross(a, b, d);
    const o3 = cross(c, d, a);
    const o4 = cross(c, d, b);

    return o1 * o2 < 0 && o3 * o4 < 0;
}

export function isValidPolygon(points: Point[]): boolean {

    if (points.length !== 4) return false;

    if (
        points.some(
            p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
        )
    ) {
        return false;
    }

    if (calculateArea(points) < 1e-8) return false;

    if (
        segmentsIntersect(
            points[0], points[1],
            points[2], points[3]
        ) ||
        segmentsIntersect(
            points[1], points[2],
            points[3], points[0]
        )
    ) {
        return false;
    }

    return true;
}

export function isValidConvexQuadrilateral(
    points: Point[]
): boolean {

    return (
        isValidPolygon(points) &&
        isConvex(points)
    );
}

// ========================================
// QUADRILATERAL GENERATOR
// ========================================

export function generateQuadrilateral(
    sides: Sides,
    angle: number
): Point[] | null {

    if (validateSideLengths(sides)) return null;

    const range = getValidAngleRange(sides);

    if (!range) return null;

    if (angle < range.min || angle > range.max) {
        return null;
    }

    // Fix A and B.

    const A: Point = { x: 0, y: 0 };

    const B: Point = {
        x: sides.AB,
        y: 0
    };

    // Calculate D.

    const radians = angle * Math.PI / 180;

    const D: Point = {
        x: sides.DA * Math.cos(radians),
        y: sides.DA * Math.sin(radians)
    };

    // Find possible positions of C.

    const candidates = circleIntersections(
        B,
        sides.BC,
        D,
        sides.CD
    );

    // Select the convex configuration.

    for (const C of candidates) {

        const sideA = cross(B, D, A);
        const sideC = cross(B, D, C);

        if (sideA * sideC >= 0) continue;

        const points = [A, B, C, D];

        if (!isValidConvexQuadrilateral(points)) {
            continue;
        }

        const actualSides = [
            distance(A, B),
            distance(B, C),
            distance(C, D),
            distance(D, A)
        ];

        const expectedSides = [
            sides.AB,
            sides.BC,
            sides.CD,
            sides.DA
        ];

        const accurate = actualSides.every(
            (value, index) =>
                Math.abs(value - expectedSides[index]) < 1e-6
        );

        if (accurate) return points;
    }

    return null;
}

// ========================================
// MEASUREMENTS
// ========================================

export function calculatePerimeter(
    points: Point[]
): number {

    if (points.length !== 4) return 0;

    let perimeter = 0;

    for (let i = 0; i < points.length; i++) {

        perimeter += distance(
            points[i],
            points[(i + 1) % points.length]
        );
    }

    return perimeter;
}

export function calculateAngles(
    points: Point[]
): number[] {

    if (points.length !== 4) return [];

    return points.map((current, i) => {

        const previous =
            points[(i - 1 + points.length) % points.length];

        const next =
            points[(i + 1) % points.length];

        const v1 = {
            x: previous.x - current.x,
            y: previous.y - current.y
        };

        const v2 = {
            x: next.x - current.x,
            y: next.y - current.y
        };

        const dot = v1.x * v2.x + v1.y * v2.y;

        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);

        const cosine = clamp(
            dot / (mag1 * mag2),
            -1,
            1
        );

        return Math.acos(cosine) * 180 / Math.PI;
    });
}

export function calculateDiagonals(points: Point[]) {

    if (points.length !== 4) {
        return { AC: 0, BD: 0 };
    }

    return {
        AC: distance(points[0], points[2]),
        BD: distance(points[1], points[3])
    };
}

// ========================================
// TRANSFORMATIONS
// ========================================

export function translateQuadrilateral(
    points: Point[],
    dx: number,
    dy: number
): Point[] {

    return points.map(p => ({
        x: p.x + dx,
        y: p.y + dy
    }));
}

export function rotateQuadrilateral(
    points: Point[],
    radians: number,
    origin: Point = points[0]
): Point[] {

    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return points.map(p => {

        const dx = p.x - origin.x;
        const dy = p.y - origin.y;

        return {
            x: origin.x + dx * cos - dy * sin,
            y: origin.y + dx * sin + dy * cos
        };
    });
}

// ========================================
// CONSTRAINED CORNER DRAGGING
// ========================================

export function findClosestConfiguration(
    sides: Sides,
    cornerIndex: 2 | 3,
    target: Point,
    currentAngle: number
): GeometryResult | null {

    const range = getValidAngleRange(sides);

    if (!range) return null;

    const samples = 720;

    let bestAngle = currentAngle;
    let bestError = Infinity;

    // Search valid configurations.

    for (let i = 0; i <= samples; i++) {

        const angle =
            range.min +
            (range.max - range.min) * i / samples;

        const points = generateQuadrilateral(
            sides,
            angle
        );

        if (!points) continue;

        const error = distance(
            points[cornerIndex],
            target
        );

        if (error < bestError) {
            bestError = error;
            bestAngle = angle;
        }
    }

    if (!Number.isFinite(bestError)) return null;

    // Refine the best result.

    const step =
        (range.max - range.min) / samples;

    let left = Math.max(
        range.min,
        bestAngle - step
    );

    let right = Math.min(
        range.max,
        bestAngle + step
    );

    for (let i = 0; i < 50; i++) {

        const m1 = left + (right - left) / 3;
        const m2 = right - (right - left) / 3;

        const p1 = generateQuadrilateral(sides, m1);
        const p2 = generateQuadrilateral(sides, m2);

        if (!p1 || !p2) break;

        const e1 = distance(p1[cornerIndex], target);
        const e2 = distance(p2[cornerIndex], target);

        if (e1 < e2) {
            right = m2;
        } else {
            left = m1;
        }
    }

    const finalAngle = (left + right) / 2;

    const finalPoints = generateQuadrilateral(
        sides,
        finalAngle
    );

    if (!finalPoints) return null;

    return {
        points: finalPoints,
        angle: finalAngle
    };
}