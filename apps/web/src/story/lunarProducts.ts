/** Cited lunar terrain products used for context. Dependency-free so any story module can import it. */
export const LUNAR_RADIUS_M = 1737400;
/** SLDEM2015: LOLA + Kaguya TC merged DEM at 512 pixels per degree (Barker et al. 2016). */
export const SLDEM2015 = {
  name: "SLDEM2015 (LOLA + Kaguya)",
  ppd: 512,
  citation:
    "Barker, M. K. et al. (2016). A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera. Icarus 273, 346–355. doi:10.1016/j.icarus.2015.07.039",
  /** pixel size along a parallel at the equator */
  get equator_m() {
    return (2 * Math.PI * LUNAR_RADIUS_M) / 360 / this.ppd;
  },
};
