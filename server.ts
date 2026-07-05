import express from "express";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createServer as createViteServer } from "vite";

const execFileAsync = promisify(execFile);

// Helper for random string
function randomStr(): string {
  return Math.random().toString(36).substring(2, 9);
}

async function runEncryption(pdfBuffer: Buffer, password: string): Promise<Buffer> {
  const randSuffix = randomStr();
  const tempIn = path.join(os.tmpdir(), `encrypt_in_${Date.now()}_${randSuffix}.pdf`);
  const tempOut = path.join(os.tmpdir(), `encrypt_out_${Date.now()}_${randSuffix}.pdf`);

  try {
    await fs.writeFile(tempIn, pdfBuffer);
    
    // Run qpdf to encrypt the PDF
    await execFileAsync("qpdf", [
      "--encrypt",
      password, // user password
      password, // owner password
      "256",    // key length (AES-256)
      "--",
      tempIn,
      tempOut
    ]);

    const result = await fs.readFile(tempOut);
    return result;
  } finally {
    // Attempt clean up of temp files
    await fs.unlink(tempIn).catch(() => {});
    await fs.unlink(tempOut).catch(() => {});
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON payload parser with a generous size limit for large PDFs
  app.use(express.json({ limit: "100mb" }));

  // API endpoint for PDF encryption
  app.post("/api/encrypt-pdf", async (req, res) => {
    const { pdfBase64, password } = req.body;

    if (!pdfBase64 || !password) {
      return res.status(400).json({ error: "Missing pdfBase64 or password" });
    }

    try {
      const buffer = Buffer.from(pdfBase64, "base64");
      const encryptedBuffer = await runEncryption(buffer, password);
      const encryptedBase64 = encryptedBuffer.toString("base64");

      res.json({
        success: true,
        base64: encryptedBase64,
      });
    } catch (error: any) {
      console.error("PDF Encryption error:", error);
      res.status(500).json({
        error: "Failed to encrypt PDF file",
        details: error.message || String(error),
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
