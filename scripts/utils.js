// ─────────── Utility functions ──────────────

// converts degrees to radians
export const toRad = deg => deg * Math.PI / 180;

// normalizes longitude to the range [-π, π]
export const normalizeLon = lon => {
    lon = lon % (2 * Math.PI);
    if (lon > Math.PI) { lon -= 2 * Math.PI; }
    else if (lon <= -Math.PI) { lon += 2 * Math.PI; }
    return lon;
};
