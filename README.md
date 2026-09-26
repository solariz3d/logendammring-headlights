# Lögendammring: car headlights that land on the track

Hey Chase! Lögendammring is a great track, and at night the car's headlights barely touched the road. We went digging to
see why, and this repo is what we found and fixed. Nothing here changes the layout or the look by day. It's all yours to
keep, change or throw away.

## What was wrong

There were two separate things, and the second one only shows once the first is fixed.

1. **Most materials ignore light.** 14 of the 16 materials in `Lögendammring.kn5` have `ksDiffuse = 0` (and
   `ksAmbient = 0.7`). A surface with zero diffuse is lit only by ambient light, so the sun and the car's headlights never
   reach it. The two exceptions are `Material.012` and `Material.002`.
2. **The road's vertex normals lie flat.** On 42 of the 43 road meshes (`1ROAD_*`), the triangles face up but the
   normals stored on their vertices point sideways. Their up component averages about 0.01, where an upward-facing road
   should be close to 1. Lighting uses those stored normals. So once diffuse is switched on, the road would light
   unevenly, depending on which way each normal happens to point relative to the car, rather than as a surface facing
   the sky. Every other surface in the file (the ground, water, tunnel, walls and props) has normals that match its
   faces. It is only the road.

## What's in the box

| file | what it does |
|---|---|
| `extension/ext_config.ini` | Your original config plus the fixes listed below it. **This alone fixes problem 1.** |
| `Lögendammring.kn5`, the patched copy (attached to the release, not in the repo because it is 26 MB and it's your file) | Your kn5 with **only the road's vertex normals recalculated**. That fixes problem 2. Same file size, and every other byte is identical to your original. |
| `tools/kn5normals.js` | The script that made that copy, so you can see exactly what it did or run it again. |
| `tools/kn5nodes.js`, `tools/kn5mats.js` | Read-only readers that print every mesh and material in a kn5. They never write anything. |

**The config changes, compared with your original `ext_config.ini`:**
- `[SHADER_REPLACEMENT_0]` gives the road (`Material.023`, `.006`, `.018`, `.017` and the start line `Material`), the
  ground (`Material.024`), the tunnel (`Material.027`) and the wall (`Material.025`) ambient 0.45 and diffuse 0.35.
  Ambient comes down from 0.7 so the track doesn't wash out by day once the sun can reach it. These are starting numbers:
  tune them to taste.
- `[RAIN_FX] PUDDLES_MATERIALS` and `[GRASS_FX] OCCLUDING_MATERIALS` named `Asphalt`, `Kerb` and `Sand`, which don't
  exist in this kn5, so puddles never appeared. They now name the road materials.
- `GRASS_MATERIALS=Grass` is commented out, with a note. No material in the file is clearly grass: `Material.024` is the
  big ground plane, and we didn't want to guess. If you name a grass material there, grass FX will switch on.
- The stray bare `LIGHTS` line (above `[LIGHT_SERIES_0]`) is removed.
- Nothing else in the file changed.

## How to install

1. **Back up two files first:** `Lögendammring.kn5` and `extension\ext_config.ini` in the track folder.
2. Copy the patched `Lögendammring.kn5` over the one in the track folder.
3. Copy `extension/ext_config.ini` over the one in the track's `extension` folder.

You can use the config without the patched kn5. The road then takes light, but unevenly, because of problem 2.

## How to undo

Copy your two backed-up files back. That's the whole undo: nothing else was touched.

## Fixing it at the source, for your next export (Blender)

The patched kn5 is a repair of the exported file. The lasting fix is in the `.blend`, so it doesn't come back on the
next export. **What follows is our best guess at the cause, not something we could see**, because we only had the kn5:
- The pattern is triangles facing up with stored normals lying sideways. That usually means the road carries **custom
  split normals** from an earlier state of the mesh, for example from before it was bent along the circuit or rotated
  into place. Blender keeps those normals and exports them instead of calculating fresh ones.
- On each road object, try **Object Data Properties → Geometry Data → Clear Custom Split Normals Data**.
- Then, in Edit Mode, run **Mesh → Normals → Recalculate Outside**.
- The **Face Orientation** overlay (blue = front) is a quick way to check which way the faces point.
- If normals still look odd in the export, check that the exporter isn't applying a rotation after the normals were set.

## One more thing we noticed: an inside-out box

`1ROAD_MainTrack.042` is a 12-triangle box on the start-line material, about 80 × 3 × 107 m, sitting at y ≈ −289. Its
normals point exactly opposite its winding, so it is inside out. Because recalculating would turn it the right way out
and change what it is, **we left it untouched** and it is the same in the patched kn5. It may be a leftover you don't
need. Recalculate Outside in Blender (above) would flip it if you want to keep it.

## Material names, for when you touch the config yourself

| material | what it is |
|---|---|
| `Material.023`, `Material.006` | the main road (93% of all triangles in the file) |
| `Material.018`, `Material.017` | the jump section's road |
| `Material` | the start line. The `AC_START_*` / `AC_PIT_*` spawn helpers use it too |
| `Material.024` | the big ground planes around and under the track |
| `Material.027` | the tunnel |
| `Material.025` | the wall (`1WALL_MainTrack`) |
| `Material.016` | the water |
| `Light` | the start lights |
| `Material.002`, `.012`, `.019`–`.022` | props and structures |

There is no kerb, pit or grass material in this kn5, so there was nothing to name for those.
