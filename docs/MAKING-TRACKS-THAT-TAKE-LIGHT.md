# Making tracks that take light — a checklist

Hey Chase, this is the short version of everything we learned fixing Lögendammring's headlights, turned into a checklist
you can run on any track before you release it. Each step says where it comes from. Where we couldn't find an official
source for something, we say so rather than pass off a guess as a rule.

Quick start: `node tools/check-track.js "<your track>.kn5" "<your track>\extension\ext_config.ini"` runs checks 1, 2
and 3 below for you and ends with a PASS/FAIL list. It only reads files.

## 1 · Materials: give everything light should reach some diffuse

- **Never leave `ksDiffuse` at 0 on a surface you want headlights or the sun to reach.** On Lögendammring, 14 of 16
  materials had `ksDiffuse = 0` and `ksAmbient = 0.7`. Those surfaces showed only their flat ambient brightness, and the
  car's lights never landed on them. Giving them diffuse fixed it: it was confirmed in a night drive.
  - *Source:* our own measurement and test on this track. **We did not find an official Kunos page defining ksDiffuse
    or ksAmbient.** The closest is a community list that describes them as "Diffuse light multiplier" and "Ambient
    light multiplier" (assettocorsamods.net, "Assetto Corsa shaders & texture maps list", 2016; secondary).
    CSP's own shader-replacement page implies the same from the other side: for an additive glow it says to "set
    `ksDiffuse` and `ksAmbient` to zero and rely only on `ksEmissive`" (CSP wiki, "General – Shader replacements").
- **Starting values:** there is no official recommendation that we could find. **What worked here** was
  `ksAmbient 0.45, ksDiffuse 0.35`: ambient down from 0.7 so the day look doesn't wash out, plus diffuse so light
  lands. Treat those as a starting point and tune them by eye.
- **Where to set them:** in the KS Editor, as the material's shader properties. **The official SDK guide covers the
  editor only in outline.** Kunos's `AC_Pipeline_PUB_Rev2.0.pdf`, which ships with the game in
  `sdk\dev\car_pipeline_2.0rev\`, says shader properties are "set up in the editor", that you can "copy and paste the
  shader values" with the Material Tools, and that "Persistence files (containing shader and object settings) can be
  saved under File". It does not name the ksDiffuse field or say which panel it sits in. So we won't give you a click
  path we can't back up.
- **Or without touching the kn5:** a CSP `[SHADER_REPLACEMENT_...]` block in `extension\ext_config.ini` can set them at
  load time, which is what this repo's config does. The syntax is `MATERIALS = <names>` and `PROP_1 = ksDiffuse, 0.5`
  (CSP wiki, "General – Shader replacements",
  https://github.com/ac-custom-shaders-patch/acc-extension-config/wiki/General-%E2%80%93-Shader-replacements).

## 2 · Normals: make sure the road's normals point up before you export

Lighting normally works from the normals stored on a surface's vertices, not from which way its triangles face. On
Lögendammring the road triangles faced up but the stored normals lay flat, so light landed unevenly.

- *Source:* Kunos's SDK guide lists what the engine reads from the FBX: "Normals (custom normals are supported)"
  (`AC_Pipeline_PUB_Rev2.0.pdf`, section 1.B.II). So whatever normals you export are the ones the game uses.

**In Blender** (our citations are the Blender manual's own source for 5.x. The rendered manual is at
https://docs.blender.org/manual/en/latest/, which is 5.2 LTS as of September 2026):

1. **Clear old custom normals.** Properties → Object Data → Geometry Data → **Add/Clear Custom Split Normals Data**
   (manual: *Modeling › Meshes › Properties › Geometry Data*). Custom normals are kept from whatever state the mesh was
   in when they were made, for example before the road was bent along the circuit. That is our best guess for how
   Lögendammring's road ended up flat, and it is a guess: we only had the exported kn5. In Edit Mode, **Mesh → Normals →
   Reset Vectors** "Resets the custom normals of the selected face corners to their default" (manual: *Mesh › Normals*).
2. **Point the faces the right way.** In Edit Mode, select the road, then **Mesh → Normals → Recalculate Outside**
   (**Shift-N**). It "Flips the orientation of the selected faces where necessary, making them all point outward"; "The
   mesh does not need to be a closed volume for this" (manual: *Mesh › Normals › Recalculate*).
3. **Smooth shading.** In Object Mode: **Object → Shade Smooth**, or **Object → Shade Auto Smooth**, which "Adds a
   Smooth by Angle" modifier with an **Angle** setting, the "Maximum angle between face normals that will be considered
   as smooth" (manual: *Scene Layout › Object › Editing › Shading*).
   - **Since Blender 4.1**, the old "Auto Smooth" checkbox is gone. The 4.1 release notes say "The 'Auto Smooth' option
     has been replaced by a modifier node group asset"
     (https://developer.blender.org/docs/release_notes/4.1/modeling/). Tutorials older than 4.1 point to a checkbox
     that no longer exists.
4. **Check the result.** Viewport Overlays → **Face Orientation**. It "Highlights the backside of faces in red"; "if a
   face is shown in red on the outside of a mesh, it's most likely oriented incorrectly" (manual: *3D Viewport ›
   Overlays*). The road's top should not be red.
5. **Export the normals.** In the FBX exporter, **Geometry → Smoothing**: "If the importer supports custom split normals,
   using *Normals Only* is generally the most accurate", and Kunos's guide says custom normals are supported (above)
   (manual 5.1: *Add-ons › Import-Export › FBX*).
   - **What we couldn't confirm:** the manual's own entry for the exporter's **Tangent Space** option is still a TODO
     (5.1 and 4.2). You only need tangents if you use normal maps, and this track uses none.

Then run `tools/check-track.js` on the exported kn5. Every `1ROAD_` mesh should PASS the normals check.

## 3 · Naming: use names the game and CSP actually match

- **Physics surfaces go by mesh name.** A mesh named like `1ROAD_MainTrack` is driven on as the surface whose `KEY` is
  `ROAD`. The base game defines `KEY=ROAD`, `KEY=GRASS`, `KEY=KERB` and `KEY=SAND` in
  `assettocorsa\system\data\surfaces.ini` (read from the game install; a track can add its own in its
  `data\surfaces.ini`). So `1ROAD_…`, `1GRASS_…`, `1KERB_…` and `1SAND_…` all work.
  - **The "digit + KEY + _" rule itself is not written down anywhere official that we could find.** It is the community
    convention: "1ROAD_3 – will make my chosen mesh drivable (in surfaces.ini: KEY=ROAD)" (assettocorsamods.net, "Build
    your first track – basic guide", 2014; secondary). Lögendammring's own road follows it.
- **CSP's grass and rain effects go by MATERIAL name** (or mesh name with the `…_MESHES` variants):
  - `[GRASS_FX] GRASS_MATERIALS` is the "list of materials to spawn grass on top of", and `OCCLUDING_MATERIALS` is the
    "list of occluding materials: for example, road mesh covering grass mesh" (CSP wiki, "Tracks – Grass FX").
  - `[RAIN_FX] PUDDLES_MATERIALS` is "the key part for physics for generating puddles"; "it is recommended to keep
    PUDDLES_MATERIALS for roads only". Also, "The main track asphalt surfaces should be defined as both
    PUDDLES_MATERIALS and SOAKING_MATERIALS" (CSP wiki, "Tracks – RainFX"). This repo's config sets PUDDLES only; adding
    the road materials to `SOAKING_MATERIALS` too is the documented next step.
  - **So give your materials real names** (`Asphalt`, `Grass`, `Kerb`…) in Blender before export, and use the same names
    in the config. Lögendammring's config named `Asphalt`, `Kerb`, `Sand` and `Grass`, but the kn5's materials were
    `Material.023` and so on, so none of those lines could do anything. `check-track.js` flags any config name that
    isn't in the kn5.

## 4 · A night test before release

A checklist, not a documented procedure. This is what showed the problem here:
- Set the time to night, pick any car, headlights on.
- Drive the whole lap **in both directions**. Flat or sideways normals show up as light that changes with the direction
  of travel.
- Look at the road, the ground beside it, walls and tunnels. Anything that stays dark under headlights has diffuse 0 or
  bad normals.
- Do a daytime lap too. If surfaces look washed out, lower ksAmbient; if they look flat and dark in the sun, raise
  ksDiffuse.
- If you use CSP rain, drive a wet session to see puddles.

---
Sources, as read on 2026-09-26:
- Blender manual source: projects.blender.org/blender/blender-manual. `main` (5.3 dev) for Geometry Data, Mesh › Normals,
  Shading and Overlays; `blender-v5.1-release` for the FBX exporter. Blender 4.1 release notes:
  developer.blender.org/docs/release_notes/4.1/modeling/.
- Kunos, `AC_Pipeline_PUB_Rev2.0.pdf` (the AC SDK, `sdk\dev\car_pipeline_2.0rev\`), and `system\data\surfaces.ini`
  (the AC install).
- CSP wiki: github.com/ac-custom-shaders-patch/acc-extension-config/wiki ("General – Shader replacements", "Tracks –
  Grass FX", "Tracks – RainFX").
- Secondary, used only where no official page exists: assettocorsamods.net threads 794 and 12.
