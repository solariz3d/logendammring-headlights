# Lögendammring: car headlights that land on the track

Hey Chase! Lögendammring is a great track, and at night the car's headlights barely touched the road. We went digging to
see why, and this repo is what we found and fixed. The layout is untouched. The look by day does change a little: the
road, ground, tunnel and wall get less ambient light (0.45 instead of 0.7) and some diffuse, so the sun now shapes them
too. It's all yours to keep, change or throw away.

## What was wrong

There were two separate things, and the second one only shows once the first is fixed.

1. **Most materials ignore light.** 14 of the 16 materials in `Lögendammring.kn5` have `ksDiffuse = 0` (and
   `ksAmbient = 0.7`). A surface with zero diffuse is lit only by ambient light, so the sun and the car's headlights never
   reach it. The two exceptions are `Material.012` and `Material.002`.
2. **The road's vertex normals lie flat.** On 42 of the 43 road meshes (`1ROAD_*`), the triangles face up but the
   normals stored on their vertices point sideways. Their up component averages about 0.01, where an upward-facing road
   should be close to 1. Lighting normally uses those stored normals. So once diffuse is switched on, the road would light
   unevenly, depending on which way each normal happens to point relative to the car, rather than as a surface facing
   the sky. The other surfaces (the ground, water, tunnel, wall and props) are not flipped and look fine; their normals
   are close to their faces (the wall is the loosest, at about 0.89 where 1 is a perfect match). The road is the one
   that is really off.

## What's in the box

| file | what it does |
|---|---|
| `extension/ext_config.ini` | Your original config plus the fixes listed below it. **This alone fixes problem 1.** |
| `Lögendammring.kn5`, the patched copy (to be attached to a release, not in the repo because it is 26 MB and it's your file) | Your kn5 with **only the road's vertex normals recalculated**. That fixes problem 2. Same file size, and every other byte is identical to your original. |
| `tools/kn5normals.js` | The script that made that copy, so you can see exactly what it did or run it again. |
| `tools/kn5nodes.js`, `tools/kn5mats.js` | Read-only readers that print every mesh and material in a kn5. They never write anything. |
| `tools/check-track.js` | A read-only checker for **any** kn5 (and its config): zero-diffuse materials, normals that disagree with their faces, inside-out meshes, config names that don't exist. Ends with PASS/FAIL. See the guide below. |
| `install.ps1`, `uninstall.ps1` | Install and undo without Content Manager (below). |
| `tools/make-release.js` | Builds the release zip, so it's never put together by hand. |
| [`docs/MAKING-TRACKS-THAT-TAKE-LIGHT.md`](docs/MAKING-TRACKS-THAT-TAKE-LIGHT.md) | **A checklist for making any track take light**: materials, normals out of Blender, naming, and a night test. Every step says where it comes from. |

**The config changes, compared with your original `ext_config.ini`:**
- `[SHADER_REPLACEMENT_0]` gives the road (`Material.023`, `.006`, `.018`, `.017` and the start line `Material`), the
  ground (`Material.024`), the tunnel (`Material.027`) and the wall (`Material.025`) ambient 0.45 and diffuse 0.35.
  Ambient comes down from 0.7 so the track doesn't wash out by day once the sun can reach it. These are starting numbers:
  tune them to taste.
- `[RAIN_FX] PUDDLES_MATERIALS` and `[GRASS_FX] OCCLUDING_MATERIALS` named `Asphalt`, `Kerb` and `Sand`, which don't
  exist in this kn5, so puddles could not have appeared. They now name the road materials.
- `GRASS_MATERIALS=Grass` is commented out, with a note. No material in the file is clearly grass: `Material.024` is the
  big ground plane, and we didn't want to guess. If you name a grass material there, grass FX will switch on.
- The stray bare `LIGHTS` line (above `[LIGHT_SERIES_0]`) is removed.
- Nothing else in the file changed.

## How to install — three ways, each with its undo

The files come in a release zip, `Lögendammring-headlights.zip` (**it will be attached to a release; there isn't one
yet**). It holds `Lögendammring\Lögendammring.kn5` (the patched copy), `Lögendammring\extension\ext_config.ini`, and your
own `Lögendammring\ui\ui_track.json`, unchanged.

**1 · Content Manager: drag the zip onto it.**
- In the install dialog, pick **"Update over existing files, keep UI information"**. Do **not** pick "Clean
  installation": that moves your whole track folder to the Recycle Bin and puts only these three files in its place.
- **Check which option is selected before you click Install.** Content Manager may pre-select "Clean installation" if
  its "prefer clean installation" setting is on. That's how its source reads (`ContentEntryBase.cs`,
  `GetDefaultUpdateOption`, lines 155–157), and the setting is yours, so we can't know it for you.
- Why the zip carries `ui_track.json`: Content Manager only recognises a folder as a track if it has
  `ui\ui_track.json`. With "keep UI information" it skips that file, so yours stays as it is. (That's how Content
  Manager's source code reads: `ContentScanner.cs` and `TrackContentEntry.cs` in gro-ove/actools. It's not in any
  documentation, and **we haven't tried the drag-and-drop ourselves**.)
- **Undo:** Content Manager's "update" doesn't keep a backup, so **copy `Lögendammring.kn5` and
  `extension\ext_config.ini` somewhere safe before you drag the zip in**, and copy them back to undo.

**2 · The script, no Content Manager needed.** Get `install.ps1` and `uninstall.ps1`: they will be attached to the same
release as the zip, and they are also at the top of this repo. Put `install.ps1` next to the zip and run
`powershell -ExecutionPolicy Bypass -File install.ps1` with the game closed. It:
- finds the game in any of your Steam libraries;
- refuses while Assetto Corsa is running, or if your `Lögendammring.kn5` isn't the version this fix was made for;
- backs up `Lögendammring.kn5` → `Lögendammring.kn5.original` and `extension\ext_config.ini` →
  `ext_config.ini.before-headlights`, never overwriting a backup that's already there;
- if you run it again after changing `ext_config.ini` yourself, saves your version as
  `ext_config.ini.user-<date-time>` first, and tells you (uninstall leaves that file alone);
- copies the two files and checks every file's SHA-256.
- Use `-TrackPath "<...\content\tracks\Lögendammring>"` to point it at a folder yourself.
- **Undo:** `powershell -ExecutionPolicy Bypass -File uninstall.ps1` moves both backups back and checks them. The
  folder ends up exactly as it was: we tested install then uninstall on a copy and every file byte-compared equal.

**3 · By hand.**
1. Back up `Lögendammring.kn5` and `extension\ext_config.ini` from the track folder.
2. From the zip, copy `Lögendammring.kn5` over yours, and `extension\ext_config.ini` over yours.
- **Undo:** copy your two backups back.

You can use the config without the patched kn5. The road then takes light, but unevenly, because of problem 2.

## Fixing it at the source, for your next export (Blender)

The patched kn5 is a repair of the exported file. The lasting fix is in the `.blend`, so it doesn't come back on the
next export. **Our best guess at the cause, not something we could see** (we only had the kn5): the road triangles face
up while their stored normals lie sideways. That is what **custom split normals** kept from an earlier state of the
mesh would look like, for example from before the road was bent along the circuit.

The steps, each checked against Blender's own manual, are in the guide:
[docs/MAKING-TRACKS-THAT-TAKE-LIGHT.md](docs/MAKING-TRACKS-THAT-TAKE-LIGHT.md), §2. In short:
- **Add/Clear Custom Split Normals Data** (Object Data → Geometry Data);
- **Mesh → Normals → Recalculate Outside** (Shift-N);
- Shade Smooth or Shade Auto Smooth;
- check with the **Face Orientation** overlay (back faces show red);
- export with FBX **Smoothing: Normals Only**.

## Two more things we noticed

**An inside-out box.**

`1ROAD_MainTrack.042` is a 12-triangle box on the start-line material, about 80 × 3 × 107 m, sitting at y ≈ −289. Its
normals point exactly opposite its winding, so it is inside out. Because recalculating would turn it the right way out
and change what it is, **we left it untouched** and it is the same in the patched kn5. It may be a leftover you don't
need. Recalculate Outside in Blender (above) would flip it if you want to keep it.

**A light series that points at nothing.** `[LIGHT_SERIES_0]` in the config says `MATERIALS = Globe`, and there is no
material called `Globe` in the kn5, so that light can't attach to anything. We left it as it was. If you meant it for
something, rename the material or the line. `tools/check-track.js` reports it.

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
