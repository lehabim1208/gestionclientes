import CryptoJS from 'crypto-js';

/**
 * Encrypts a string using AES with a master key.
 */
export const encrypt = (text: string, masterKey: string): string => {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, masterKey).toString();
};

/**
 * Decrypts an AES encrypted string using a master key.
 */
export const decrypt = (ciphertext: string, masterKey: string): string => {
  if (!ciphertext) return '';
  
  // If it doesn't look like CryptoJS AES encryption (which starts with U2FsdGVkX1),
  // it might be plain text from before encryption was implemented.
  if (!ciphertext.startsWith('U2FsdGVkX1')) {
    return ciphertext;
  }

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, masterKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    // If decryption fails due to wrong key, originalText will be empty
    if (!originalText && ciphertext.length > 0) {
      return '[Error de Descifrado]';
    }
    return originalText;
  } catch (e) {
    return '[Error de Descifrado]';
  }
};

/**
 * Extracts coordinates from a Google Maps URL.
 * Example URL: https://www.google.com/maps/place/Name/@19.4326,-99.1332,17z/...
 */
export const extractCoordsFromUrl = (url: string): { lat: number; lng: number } | null => {
  // Pattern 1: @lat,lng
  const regex1 = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const match1 = url.match(regex1);
  if (match1 && match1[1] && match1[2]) {
    return {
      lat: parseFloat(match1[1]),
      lng: parseFloat(match1[2]),
    };
  }

  // Pattern 2: q=lat,lng
  const regex2 = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
  const match2 = url.match(regex2);
  if (match2 && match2[1] && match2[2]) {
    return {
      lat: parseFloat(match2[1]),
      lng: parseFloat(match2[2]),
    };
  }

  // Pattern 3: !3dLat!4dLng
  const regex3 = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
  const match3 = url.match(regex3);
  if (match3 && match3[1] && match3[2]) {
    return {
      lat: parseFloat(match3[1]),
      lng: parseFloat(match3[2]),
    };
  }

  return null;
};

/**
 * Calculates the distance between two points in kilometers using the Haversine formula.
 */
export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};
