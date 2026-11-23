// US state shapes (us-atlas, from the Census Bureau) keyed by postal code, matching the
// `state` field of airports.json.

import { feature } from "topojson-client"
import type { GeometryCollection, Topology } from "topojson-specification"
import statesTopo from "us-atlas/states-10m.json"

/** Census FIPS code -> postal code. Includes DC and the territories with AA airports. */
const FIPS_TO_POSTAL: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR", "78": "VI",
}

export type StateProps = { postal: string; name: string }
export type StateCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, StateProps>

export function loadStates(): StateCollection {
  const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>
  const fc = feature(topo, topo.objects.states) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string }>
  return {
    type: "FeatureCollection",
    features: fc.features
      .filter((f) => FIPS_TO_POSTAL[String(f.id)])
      .map((f) => ({ ...f, properties: { postal: FIPS_TO_POSTAL[String(f.id)], name: f.properties.name } })),
  }
}

/** [west, south, east, north] of a state's shape. Alaska's Aleutians cross the antimeridian, so
 *  longitudes east of 0 are wrapped to keep the box on the US side. */
export function stateBounds(f: StateCollection["features"][number]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const poly of polys)
    for (const [lon0, lat] of poly[0]) {
      const lon = lon0 > 0 ? lon0 - 360 : lon0
      w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat)
    }
  return [w, s, e, n]
}
