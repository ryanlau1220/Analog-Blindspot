# Analog Blindspot

**Team:** Machine Not Learning  
**Team member:** Ryan Lau Jun Hong  
**Challenge:** Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars

## Project summary

A lunar pit can look like a cave entrance, but an image alone does not map the underground. Analog Blindspot combines a real LROC terrain model of Marius Hills Pit with Earth elevation data from Lava Beds and Lanzarote. Visitors predict how sampled landmark relief compares with background as Earth terrain is averaged onto coarser grids. A lattice search flags unverified anomalies and compares proximity to separate OpenStreetMap entrance points. The decision view connects the evidence to two field investigation questions.

The Earth sites are established analogs, and the anomalies are leads requiring verification. The relief comparison is not a detection benchmark or a validated lunar sensor model. Mars candidate sizes provide context; the prototype does not analyze Martian elevation or recommend a validated base site. No subsurface geometry is measured.

## Deliverables

- `Analog-Blindspot_Demo-Video.mp4` — a short product demonstration with synthesized spoken narration and music.
- `Analog-Blindspot_Pitch-Deck.pdf` — seven-slide presentation with independent explanatory graphics and an Archify data-flow diagram.
- Live prototype: https://analog-blindspot.ryanlau1220.workers.dev/
- Source code: https://github.com/ryanlau1220/Analog-Blindspot

## Demo narration

“I am Ryan Lau, from Machine Not Learning. Could a lunar pit shelter future explorers? Analog Blindspot shows what maps cannot see. We compare real Earth terrain with a coarser simulation, then search for terrain clues. At Lava Beds, our analysis flags twenty four unverified clusters. These are research leads, not confirmed caves. The next step: verify promising sites on the ground.”

The visuals show the lunar pit and its missing elevation, a split terrain comparison, and the highlighted Lava Beds search leads. Instrumental music plays underneath.

## Sources and credits

- Lunar terrain: NASA/GSFC/Arizona State University, LROC NAC DTM MARIUSPIT01: https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_MARIUSPIT01
- Lava Beds LiDAR: NCALM / OpenTopography, Williams (2024), CC BY 4.0: https://doi.org/10.5069/G9ST7N19
- Lanzarote terrain: CNIG PNOA-LiDAR MDT02, tile 1080-4, CC BY 4.0: https://centrodedescargas.cnig.es/CentroDescargas/catalogo.do?Serie=MDT02
- NASADEM: NASA JPL (2020), NASADEM Merged DEM Global 1 arc second V001: https://doi.org/10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001
- Diviner Global Cumulative Product: https://doi.org/10.1016/j.icarus.2016.08.012
- Cave entrance points: © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright
- Mars candidate skylight sizes: Cushing et al. (2007): https://doi.org/10.1029/2007GL030709
- Full provenance, code, tests and limitations are in the repository README, data manifests and application evidence drawer.
