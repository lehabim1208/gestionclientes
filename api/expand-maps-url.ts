export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    let currentUrl = url;
    let finalUrl = url;
    let html = "";
    let redirects = 0;
    const maxRedirects = 5;

    while (redirects < maxRedirects) {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const nextUrl = new URL(location, currentUrl).toString();
          currentUrl = nextUrl;
          finalUrl = nextUrl;
          redirects++;
          
          // If the new URL already contains coordinates, we can stop here
          if (/@(-?\d+\.\d+),(-?\d+\.\d+)/.test(finalUrl) || /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.test(finalUrl)) {
            break;
          }
          continue;
        }
      }

      // If we reach here, it's not a redirect
      html = await response.text();
      finalUrl = response.url || currentUrl;
      break;
    }
    
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
    
    if (!name && html) {
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
      return res.status(200).json({
        lat,
        lng,
        name,
        finalUrl
      });
    }

    // If no coordinates found in URL, try to look in the HTML (sometimes they are in meta tags)
    if (html) {
      const metaCoordsRegex = /meta content=".*?(-?\d+\.\d+);(-?\d+\.\d+)"/;
      const metaMatch = html.match(metaCoordsRegex);
      
      if (metaMatch && metaMatch[1] && metaMatch[2]) {
        return res.status(200).json({
          lat: parseFloat(metaMatch[1]),
          lng: parseFloat(metaMatch[2]),
          name,
          finalUrl
        });
      }
    }

    return res.status(404).json({ error: "Could not extract coordinates from URL", finalUrl });
  } catch (error: any) {
    console.error("Error expanding URL:", error);
    return res.status(500).json({ error: "Failed to expand URL" });
  }
}
