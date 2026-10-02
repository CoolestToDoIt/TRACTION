# Rendering and hill optimization review

The game loads and caches a circuit before racing. High-speed stutters are not evidence of road downloads. The current renderer projects CPU-side geometry through Canvas 2D, sorts polygons, paints affine texture triangles, and rebuilds dynamic car sprites. Wide roads, steep camera views, overlapping track sections, Retina resolution, and accumulated effects can increase work. A browser trace is needed to distinguish CPU, rasterization, garbage collection, and GPU limits on the affected device.

## Fixes in this change

- Sunstone uses centripetal horizontal interpolation and shape-preserving elevation interpolation, with gentler hairpin elevation controls. Four hairpins and the mountain's elevation range remain.
- Copper Canyon, Sunstone, and Meadow use a continuous triangulated height field instead of terrain ribbons that end beside the road. Off-road physics samples the same detailed triangles; a shoulder apron joins the road to the ground. Props use ground height too.
- Cars leaving the height-field bounds recover to the road without earning laps or checkpoints. This arcade game still pins cars to a surface; there is no airborne/jump simulation.
- Chase-camera height and pitch ease independently, enforce ground clearance, and reset after teleports or look-back changes. Off-road car pitch samples the terrain slope.
- Cached road/terrain meshes have distance-dependent detail. Sharp bends and crests refine road segments, and nearby road/terrain retains detailed geometry. Coarse terrain has conservative height-aware culling; distant road/props also receive conservative hill occlusion checks.
- Opaque polygons of matching color batch when adjacent in depth order. Asphalt grain is limited to nearby road.
- Rendering has a 1.2-million-pixel ceiling and steps down in resolution after sustained slow frames, then recovers more slowly. This changes visual sharpness, not physics or track dimensions.
- `?perf=1` enables an FPS/frame-p95 overlay and separate simulation/render-UI CPU measurements. The CPU measurements exclude asynchronous GPU work.

The terrain pass and coarse ray tests improve coverage but do not provide a true depth buffer. Canvas polygon sorting still cannot resolve every overlapping hill/road intersection. A GPU renderer is the recommended structural fix if those artifacts persist.

## Options, ordered from most drastic to smallest change

| Rank | Change | Benefit and tradeoff | Recommendation |
| --- | --- | --- | --- |
| 1 | Migrate to a complete 3D engine and asset pipeline | Broad rendering/tooling capabilities, but reworks imports, scenery, camera, and assets; greatest project scope. | Not the first move. Preserve the existing simulation. |
| 2 | Replace Canvas projection with a GPU mesh renderer and depth buffer | Batch static road/terrain buffers, hardware perspective textures, reliable hill/road occlusion; replaces most of `renderer.js`. | **Best next major change if these fixes are insufficient.** Keep `engine.js` and content formats. |
| 3 | Move rendering to a worker with OffscreenCanvas | Reduces UI contention, but needs snapshots, worker input, resize handling, and feature fallback. Does not remove raster/GPU limits. | Only after a trace confirms main-thread contention. |
| 4 | Build shared terrain tiles and matching collision-height queries | Fixes missing hills and floating off-road cars; adds map-preparation work and bounds handling. | **Implemented for the rural defaults.** |
| 5 | Stream large worlds with a spatial tile index and prefetch | Bounds large-map memory/preparation work; adds loading lifecycle and cache management. | Useful for substantially larger custom maps; default maps are already cached. |
| 6 | Add road/terrain level of detail with curve/crest refinement | Fewer distant polygons while retaining nearby elevation; transitions need care. | **Implemented.** More aggressive simplification should be measured for popping. |
| 7 | Bake road markings/curbs into materials or segment assets | Replaces many individual lane/curb polygons; changes the material/modding pipeline. | Recommended with the GPU migration; evaluate a Canvas atlas only if staying with Canvas. |
| 8 | Cache car sprites by skin, heading, pitch, and steering bins | Avoids projecting hundreds of car faces every frame; costs memory and can cause angle stepping. | Good next Canvas optimization if cars dominate the trace. |
| 9 | Add simulation broad phases and hinted nearest-road searches | Reduces building/road query work; must preserve correctness on hairpins and off-road recovery. | Profile simulation first. Never assume neighboring track indices are always nearest. |
| 10 | Use bounded/adaptive resolution | Cuts raster work on large/Retina screens; temporary softness when under load. | **Implemented.** Adjust `MAX_RENDER_PIXELS` after device testing. |
| 11 | Pool projection/face buffers or use typed arrays | Reduces allocation and garbage-collection spikes; increases code complexity. | Recommended only when GC spikes appear in traces. |
| 12 | Reuse static geometry, projections, minimap, and panoramas | Removes repeated construction and static drawing work; needs cache invalidation when content changes. | **Already implemented.** |
| 13 | Batch adjacent flat faces and palette colors | Fewer Canvas state changes/fills; arbitrary color reordering would break depth order. | **Implemented without changing painter order.** |
| 14 | Restrict asphalt texture subdivision and distant texture detail | Fewer Canvas transforms/clips and less shimmer; loses distant grain. | **Implemented.** Further texture reduction is a low-risk fallback. |
| 15 | Cull invisible/distant geometry before drawing | Saves projection/raster work; naive horizontal or height culling can drop hill crests. | **Implemented with height margins and conservative terrain occlusion.** |
| 16 | Bound skid marks and effect update rates | Prevents growing per-frame work during drifting; effects have shorter history. | **Already implemented.** |
| 17 | Throttle HUD/minimap and avoid unnecessary DOM writes | Reduces layout/UI work; less frequent text updates. | HUD at 20 Hz and static minimap caching are already in place. Cache unchanged text if traces show UI cost. |
| 18 | Shorten draw distance or disable effects in a low-quality preset | Small implementation cost; visible pop-in and less scenery. | Last resort. Do not hide terrain beneath the player or shorten visibility blindly on hills. |

## Recommended next sequence

1. Test these changes on the affected device at the same window size and race conditions. Open `http://localhost:8000/?perf=1`; compare frame p95, not just average FPS.
2. Record a browser Performance trace during boosted Meadow hills and Sunstone hairpins. Check simulation CPU, rendering CPU, raster/GPU work, and garbage collection. A 60 FPS frame has about 16.7 ms total budget; the renderer cannot use all of it.
3. If CPU car projection dominates, cache directional car sprites. If GC dominates, pool projection buffers. If rasterization dominates, tune the pixel budget/material detail.
4. If depth artifacts remain, or Canvas still cannot meet the budget, migrate rendering to GPU buffers with a depth-tested shared terrain/road mesh. Avoid spending indefinitely on Canvas micro-optimizations.

## Validation and limits

`npm test` covers races on all map/difficulty pairs, handling/drift behavior, Sunstone hairpins, cached elevation/seams, clipping/look-back, ground height, camera clearance/smoothing, recovery, and resolution limits. `npm run benchmark` reports repeatable renderer CPU/draw-call samples with a counting Canvas substitute. Its timings are not browser FPS and do not measure GPU/rasterization. Geometry previews were inspected; hands-on browser performance and camera feel still require testing on the affected device.

### Headless benchmark comparison against the previous commit

| Track | Previous calls/frame | Updated calls/frame | Reduction |
| --- | ---: | ---: | ---: |
| Copper Canyon | 12,172 | 7,457 | 39% |
| Midnight Metro | 14,238 | 9,915 | 30% |
| Sunstone Pass | 19,013 | 7,976 | 58% |
| Meadow Run | 12,913 | 8,204 | 36% |

These are the benchmark's sampled views and drift history, not a promise of the same FPS gain. Sunstone's geometry and camera were also changed, so the comparison measures the resulting scenario rather than an isolated renderer microbenchmark.
