/**
 * Plotrix PDF Export
 *
 * Page 1: Survey map
 * Page 2: Survey measurements
 *
 * Hindi report text is rendered as HTML text and printed by Chromium.
 * This allows the browser's Indic shaping engine to correctly render
 * Devanagari matras, conjuncts and glyph positioning.
 */

const svgToPng = async (
    svgElement: SVGSVGElement,
    scale: number = 3
): Promise<string> => {

    const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;

    const elements = Array.from(
        svgElement.querySelectorAll(
            "polygon, line, circle, text, path, rect"
        )
    );

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {

        const tag = element.tagName.toLowerCase();

        if (tag === "rect") {

            const fill = element.getAttribute("fill") || "";

            if (
                fill.includes("url(#grid)") ||
                element.getAttribute("width") === "100%" ||
                element.getAttribute("height") === "100%"
            ) {
                return;
            }
        }

        if (element.closest("defs")) return;

        try {

            const box = (element as SVGGraphicsElement).getBBox();

            if (!box.width && !box.height) return;

            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);

            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);

        } catch {
            // Ignore elements that cannot be measured.
        }

    });

    if (!Number.isFinite(minX)) {
        throw new Error("Could not determine drawing bounds.");
    }

    const padding = 35;

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    clonedSvg.setAttribute(
        "xmlns",
        "http://www.w3.org/2000/svg"
    );

    clonedSvg.setAttribute(
        "viewBox",
        `${minX} ${minY} ${width} ${height}`
    );

    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));

    const svgString = new XMLSerializer().serializeToString(clonedSvg);

    const blob = new Blob(
        [svgString],
        { type: "image/svg+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    try {

        const image = new Image();

        await new Promise<void>((resolve, reject) => {

            image.onload = () => resolve();

            image.onerror = () =>
                reject(new Error("Could not render SVG."));

            image.src = url;

        });

        const canvas = document.createElement("canvas");

        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Could not create canvas context.");
        }

        context.fillStyle = "#ffffff";

        context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        context.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );

        return canvas.toDataURL("image/png");

    } finally {

        URL.revokeObjectURL(url);

    }

};


/**
 * Downloads the plot drawing as PNG.
 */
export const downloadSurveyPNG = async (
    svgElement: SVGSVGElement,
    filename: string = "plotrix-survey.png"
): Promise<void> => {

    const pngData = await svgToPng(svgElement);

    const link = document.createElement("a");

    link.href = pngData;
    link.download = filename;

    link.click();

};


/**
 * Converts a TTF file to Base64.
 */
const loadFontBase64 = async (): Promise<string> => {

    const response = await fetch(
        "/fonts/NotoSansDevanagari-Regular.ttf"
    );

    if (!response.ok) {
        throw new Error("Could not load Hindi font.");
    }

    const buffer = await response.arrayBuffer();

    const bytes = new Uint8Array(buffer);

    let binary = "";

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);

};


/**
 * Escape HTML text.
 */
const escapeHtml = (text: string): string => {

    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

};


/**
 * Creates the PDF through Chromium's native print renderer.
 *
 * Hindi text is kept as actual HTML text and is NOT rasterized.
 */
export const downloadSurveyPDF = async (
    svgElement: SVGSVGElement,
    reportLines: string[] = [],
    filename: string = "Plotrix-Survey.pdf",
    mapTitle: string = "RE-SURVEY MAP",
    mapSubtitle: string = "(Updated Survey Boundaries and Measurements)"
): Promise<void> => {

    try {

        const mapImage = await svgToPng(svgElement, 4);

        const fontBase64 = await loadFontBase64();

        const pageWidth = 297;
        const pageHeight = 210;

        const half = Math.ceil(reportLines.length / 2);

        const columns = [
            reportLines.slice(0, half),
            reportLines.slice(half)
        ];

        const renderColumn = (lines: string[]) => {

            return lines.map(line => {

                if (!line.trim()) {
                    return `<div class="spacer"></div>`;
                }

                const isHeading =
                    line === line.toUpperCase() &&
                    line.length < 35;

                return `
                    <div class="${isHeading ? "section-heading" : "report-line"}">
                        ${escapeHtml(line)}
                    </div>
                `;

            }).join("");

        };


        const printWindow = window.open(
            "",
            "_blank"
        );

        if (!printWindow) {

            throw new Error(
                "Popup blocked. Please allow popups for Plotrix."
            );

        }


        printWindow.document.open();

        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<title>${escapeHtml(filename)}</title>

<style>

@font-face {
    font-family: "NotoDevanagari";
    src: url(data:font/ttf;base64,${fontBase64}) format("truetype");
    font-weight: normal;
    font-style: normal;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    color: #111;
    font-family: "Times New Roman", serif;
}

@page {
    size: A4 landscape;
    margin: 0;
}

.page {
    width: 297mm;
    height: 210mm;
    padding: 10mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
}

.page:last-child {
    page-break-after: auto;
}

/* =====================================
   PAGE 1
===================================== */

.map-title {
    text-align: center;
    font-size: 24pt;
    font-weight: bold;
    margin-top: 1mm;
}

.map-subtitle {
    text-align: center;
    font-size: 11pt;
    font-style: italic;
    margin-top: 2mm;
}

.header-line {
    border-top: 1px solid #555;
    margin-top: 4mm;
}

.map-container {
    width: 100%;
    height: 165mm;
    display: flex;
    justify-content: center;
    align-items: center;
}

.map-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.footer {
    position: absolute;
    bottom: 4mm;
    left: 10mm;
    right: 10mm;
    font-size: 8pt;
    font-style: italic;
    display: flex;
    justify-content: space-between;
}

/* =====================================
   PAGE 2
===================================== */

.report-title {
    text-align: center;
    font-size: 22pt;
    font-weight: bold;
    margin-top: 2mm;
}

.report-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12mm;
    margin-top: 10mm;
}

.report-column {
    font-size: 10pt;
    line-height: 1.45;
    overflow-wrap: break-word;
}

.section-heading {
    font-weight: bold;
    font-size: 12pt;
    margin-top: 3mm;
    margin-bottom: 1.5mm;
}

.report-line {
    margin-bottom: 1mm;
}

.spacer {
    height: 3mm;
}

/*
 * Crucial: Hindi is rendered as text by Chromium.
 * The font supports glyphs, while Chromium performs
 * the actual Devanagari shaping.
 */

.report-column,
.report-line,
.section-heading {
    font-family:
        "NotoDevanagari",
        "Noto Sans Devanagari",
        "Mangal",
        sans-serif;
}

.report-title {
    font-family: "Times New Roman", serif;
}

@media screen {

    body {
        background: #ddd;
    }

    .page {
        background: white;
        margin: 10px auto;
        box-shadow: 0 0 8px #999;
    }

}

@media print {

    body {
        background: white;
    }

}

</style>

</head>

<body>

<!-- PAGE 1 -->

<div class="page">

    <div class="map-title">
        ${escapeHtml(mapTitle)}
    </div>

    <div class="map-subtitle">
        ${escapeHtml(mapSubtitle)}
    </div>

    <div class="header-line"></div>

    <div class="map-container">
        <img src="${mapImage}" />
    </div>

    <div class="footer">

        <span>
            Mathematical plot plan only.
            Not a certified cadastral or legal survey.
        </span>

        <span>
            Generated using Plotrix
        </span>

    </div>

</div>


<!-- PAGE 2 -->

<div class="page">

    <div class="report-title">
        SURVEY MEASUREMENTS
    </div>

    <div class="header-line"></div>

    <div class="report-columns">

        <div class="report-column">
            ${renderColumn(columns[0])}
        </div>

        <div class="report-column">
            ${renderColumn(columns[1])}
        </div>

    </div>

    <div class="footer">

        <span>
            Mathematical plot plan only.
            Not a certified cadastral or legal survey.
        </span>

        <span>
            Generated using Plotrix
        </span>

    </div>

</div>

<script>

window.onload = async function() {

    /*
     * Wait until the font is fully loaded before printing.
     */

    try {

        await document.fonts.ready;

    } catch (e) {

        console.error("Font loading error", e);

    }

    setTimeout(() => {

        window.print();

    }, 500);

};

</script>

</body>
</html>
        `);

        printWindow.document.close();

    } catch (error) {

        console.error("PDF export failed:", error);

        throw error;

    }

};