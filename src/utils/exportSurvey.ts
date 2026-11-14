import { jsPDF } from "jspdf";

/**
 * Converts an SVG element into a high-resolution PNG data URL.
 */
const svgToPng = async (
    svgElement: SVGSVGElement,
    scale: number = 3
): Promise<string> => {
    const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;

    // Find the visible drawing bounds, excluding the grid background.
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

        // Ignore the full-canvas background and grid.
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

        // Ignore pattern definitions.
        if (element.closest("defs")) return;

        try {
            const box = (element as SVGGraphicsElement).getBBox();

            if (!box.width && !box.height) return;

            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);

            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
        } catch {
            // Ignore elements without measurable bounds.
        }
    });

    if (!Number.isFinite(minX)) {
        throw new Error("Could not determine drawing bounds.");
    }

    // Add breathing room around all annotations.
    const padding = 35;

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    clonedSvg.setAttribute(
        "viewBox",
        `${minX} ${minY} ${width} ${height}`
    );

    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));

    const svgString = new XMLSerializer().serializeToString(clonedSvg);

    const blob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    try {
        const image = new Image();

        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(
                new Error("Could not render SVG.")
            );

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
 * Downloads the plot drawing as a high-resolution PNG.
 */
export const downloadSurveyPNG = async (
    svgElement: SVGSVGElement,
    filename: string = "plotrix-survey.png"
): Promise<void> => {
    try {
        const pngData = await svgToPng(svgElement);

        const link = document.createElement("a");
        link.href = pngData;
        link.download = filename;
        link.click();
    } catch (error) {
        console.error("PNG export failed:", error);
        throw error;
    }
};

/**
 * Creates an A4 landscape survey PDF.
 * Drawing appears on the left and survey information on the right.
 */
export const downloadSurveyPDF = async (
    svgElement: SVGSVGElement,
    reportLines: string[] = [],
    filename: string = "Plotrix-Survey.pdf"
): Promise<void> => {
    try {
        const image = await svgToPng(svgElement, 4);

        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const margin = 10;

        // =====================================
        // PAGE 1: SURVEY MAP
        // =====================================

        pdf.setFont("times", "bold");
        pdf.setFontSize(24);

        pdf.text(
            "RE-SURVEY MAP",
            pageWidth / 2,
            15,
            { align: "center" }
        );

        pdf.setFont("times", "italic");
        pdf.setFontSize(11);

        pdf.text(
            "(Updated Survey Boundaries and Measurements)",
            pageWidth / 2,
            22,
            { align: "center" }
        );

        pdf.setDrawColor(70, 70, 70);

        pdf.line(
            margin,
            27,
            pageWidth - margin,
            27
        );

        const properties = pdf.getImageProperties(image);

        const aspectRatio =
            properties.width / properties.height;

        const availableWidth = pageWidth - margin * 2;
        const availableHeight = 165;

        let drawingWidth = availableWidth;
        let drawingHeight = drawingWidth / aspectRatio;

        if (drawingHeight > availableHeight) {
            drawingHeight = availableHeight;
            drawingWidth = drawingHeight * aspectRatio;
        }

        const drawingX = (pageWidth - drawingWidth) / 2;
        const drawingY = 30 + (availableHeight - drawingHeight) / 2;

        pdf.addImage(
            image,
            "PNG",
            drawingX,
            drawingY,
            drawingWidth,
            drawingHeight
        );

        pdf.setFont("times", "italic");
        pdf.setFontSize(8);

        pdf.text(
            "Mathematical plot plan only. Not a certified cadastral or legal survey.",
            margin,
            pageHeight - 6
        );

        pdf.text(
            "Generated using Plotrix",
            pageWidth - margin,
            pageHeight - 6,
            { align: "right" }
        );

        // =====================================
        // PAGE 2: COMPLETE SURVEY REPORT
        // =====================================

        pdf.addPage("a4", "landscape");

        pdf.setFont("times", "bold");
        pdf.setFontSize(22);

        pdf.text(
            "SURVEY MEASUREMENTS",
            pageWidth / 2,
            18,
            { align: "center" }
        );

        pdf.setDrawColor(70, 70, 70);

        pdf.line(
            margin,
            25,
            pageWidth - margin,
            25
        );

        const columnWidth = 125;

        const columns = [
            reportLines.slice(0, Math.ceil(reportLines.length / 2)),
            reportLines.slice(Math.ceil(reportLines.length / 2))
        ];

        columns.forEach((lines, columnIndex) => {

            const x = columnIndex === 0
                ? margin
                : pageWidth / 2 + 5;

            let y = 38;

            lines.forEach(line => {

                if (!line.trim()) {
                    y += 4;
                    return;
                }

                const isHeading =
                    line === line.toUpperCase() &&
                    line.length < 35;

                pdf.setFont(
                    "times",
                    isHeading ? "bold" : "normal"
                );

                pdf.setFontSize(isHeading ? 12 : 10);

                const wrapped = pdf.splitTextToSize(
                    line,
                    columnWidth
                );

                wrapped.forEach((text: string) => {

                    if (y > pageHeight - 20) return;

                    pdf.text(text, x, y);

                    y += isHeading ? 7 : 5;

                });

            });

        });

        pdf.setFont("times", "italic");
        pdf.setFontSize(8);

        pdf.text(
            "Mathematical plot plan only. Not a certified cadastral or legal survey.",
            margin,
            pageHeight - 6
        );

        pdf.save(filename);

    } catch (error) {
        console.error("PDF export failed:", error);
        throw error;
    }
};