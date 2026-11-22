export async function loadHindiFont(doc: any) {
    const response = await fetch(
        "/fonts/NotoSansDevanagari-Regular.ttf"
    );

    const buffer = await response.arrayBuffer();

    const bytes = new Uint8Array(buffer);

    let binary = "";

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);

    doc.addFileToVFS(
        "NotoSansDevanagari-Regular.ttf",
        base64
    );

    doc.addFont(
        "NotoSansDevanagari-Regular.ttf",
        "NotoSansDevanagari",
        "normal"
    );

    doc.setFont("NotoSansDevanagari");

}