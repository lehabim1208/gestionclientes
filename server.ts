import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to expand Google Maps short URLs and extract data
  app.post("/api/expand-maps-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // Follow redirects to get the final URL
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });

      const finalUrl = response.url;
      
      // Extract coordinates: @lat,lng
      const coordsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
      const coordsMatch = finalUrl.match(coordsRegex);
      
      // Extract coordinates: !3dLat!4dLng (common in some Google Maps URLs)
      const internalCoordsRegex = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
      const internalMatch = finalUrl.match(internalCoordsRegex);
      
      let lat = 0;
      let lng = 0;
      let foundCoords = false;

      if (coordsMatch && coordsMatch[1] && coordsMatch[2]) {
        lat = parseFloat(coordsMatch[1]);
        lng = parseFloat(coordsMatch[2]);
        foundCoords = true;
      } else if (internalMatch && internalMatch[1] && internalMatch[2]) {
        lat = parseFloat(internalMatch[1]);
        lng = parseFloat(internalMatch[2]);
        foundCoords = true;
      }

      // Extract name from /maps/place/Name+Of+Place/
      const nameRegex = /\/maps\/place\/([^/@?]+)/;
      const nameMatch = finalUrl.match(nameRegex);
      
      let name = "";
      if (nameMatch && nameMatch[1]) {
        name = decodeURIComponent(nameMatch[1].replace(/\+/g, " "));
      }

      const html = await response.text();
      
      if (!name) {
        // Try to extract name from title tag
        const titleRegex = /<title>([^<]+) - Google Maps<\/title>/;
        const titleMatch = html.match(titleRegex);
        if (titleMatch && titleMatch[1]) {
          name = titleMatch[1].trim();
        } else {
           const titleRegex2 = /<title>([^<]+)<\/title>/;
           const titleMatch2 = html.match(titleRegex2);
           if (titleMatch2 && titleMatch2[1] && titleMatch2[1] !== 'Google Maps') {
             name = titleMatch2[1].replace(' - Google Maps', '').trim();
           }
        }
      }

      if (foundCoords) {
        return res.json({
          lat,
          lng,
          name,
          finalUrl
        });
      }

      // If no coordinates found in URL, try to look in the HTML (sometimes they are in meta tags)
      const metaCoordsRegex = /meta content=".*?(-?\d+\.\d+);(-?\d+\.\d+)"/;
      const metaMatch = html.match(metaCoordsRegex);
      
      if (metaMatch && metaMatch[1] && metaMatch[2]) {
        return res.json({
          lat: parseFloat(metaMatch[1]),
          lng: parseFloat(metaMatch[2]),
          name,
          finalUrl
        });
      }

      res.status(404).json({ error: "Could not extract coordinates from URL", finalUrl });
    } catch (error: any) {
      console.error("Error expanding URL:", error);
      res.status(500).json({ error: "Failed to expand URL" });
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
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
