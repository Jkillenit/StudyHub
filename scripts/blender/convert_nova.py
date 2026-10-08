"""Convert the Halo 4 Cortana rig (art/nova/proto) into Nova's VRM 1.0 model.

blender -b art/nova/proto/new_cortana_halo4_og.blend --python scripts/blender/convert_nova.py -- <out.vrm> [<debug.blend>]

Steps: meters + Z-up transforms, VRM humanoid mapping, spec T-pose baked as the rest pose,
VRM node constraints that drive the game's joint helper bones, face shape keys baked from
the face bones (visemes, blinks, moods), materials rebuilt on the greyscale textures, export.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else None
DEBUG_BLEND = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else None
TEX = os.path.dirname(bpy.data.filepath)

ARM = bpy.data.objects["Armature"]
MESHES = [bpy.data.objects[n] for n in ("body", "eyelashes", "hair")]


def log(*a):
    print("[convert]", *a, flush=True)


def select_only(objs, active):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


# ---------------------------------------------------------------- scene cleanup + transforms
for ob in list(bpy.data.objects):
    if ob.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(ob)
if ARM.animation_data:
    ARM.animation_data_clear()
for pb in ARM.pose.bones:
    pb.matrix_basis = Matrix()
ARM.data.pose_position = "POSE"

bpy.context.view_layer.update()
"""The armature stays in the game's inch units with Y up; the exporter bakes its object transform in."""
TO_ARM = ARM.matrix_world.inverted().to_3x3()
log("height", round(max((MESHES[0].matrix_world @ v.co).z for v in MESHES[0].data.vertices), 3))

# ---------------------------------------------------------------- humanoid mapping
SIDE = {"left": "left", "right": "right"}
HUMAN = {
    "hips": "root hips",
    "spine": "spine lower",
    "chest": "spine middle 2",
    "upper_chest": "spine upper",
    "neck": "head neck lower",
    "head": "head neck upper",
    "jaw": "head jaw",
}
for s in ("left", "right"):
    HUMAN.update({
        f"{s}_eye": f"head eyeball {s}",
        f"{s}_upper_leg": f"leg {s} thigh",
        f"{s}_lower_leg": f"leg {s} knee",
        f"{s}_foot": f"leg {s} ankle",
        f"{s}_toes": f"leg {s} toes",
        f"{s}_shoulder": f"arm {s} shoulder 1",
        f"{s}_upper_arm": f"arm {s} shoulder 2",
        f"{s}_lower_arm": f"arm {s} elbow",
        f"{s}_hand": f"arm {s} wrist",
        f"{s}_thumb_metacarpal": f"arm {s} finger 1a",
        f"{s}_thumb_proximal": f"arm {s} finger 1b",
        f"{s}_thumb_distal": f"arm {s} finger 1c",
    })
    for finger, n in (("index", 2), ("middle", 3), ("ring", 4), ("little", 5)):
        for seg, k in (("proximal", "a"), ("intermediate", "b"), ("distal", "c")):
            HUMAN[f"{s}_{finger}_{seg}"] = f"arm {s} finger {n}{k}"

ext = ARM.data.vrm_addon_extension
ext.spec_version = "1.0"
hb = ext.vrm1.humanoid.human_bones
for prop, bone in HUMAN.items():
    assert bone in ARM.data.bones, bone
    getattr(hb, prop).node.bone_name = bone
assert hb.bones_are_correctly_assigned(), "humanoid mapping rejected"

meta = ext.vrm1.meta
meta.vrm_name = "Nova"
if not meta.authors:
    meta.authors.add().value = "Study Hub"
ext.vrm1.look_at.type = "bone"

# ---------------------------------------------------------------- T-pose baked as rest
select_only([ARM], ARM)
bpy.ops.vrm.make_estimated_humanoid_t_pose(armature_object_name=ARM.name)
bpy.context.view_layer.update()

for ob in MESHES:
    select_only([ob], ob)
    mod = next(m for m in ob.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=mod.name)
select_only([ARM], ARM)
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
for ob in MESHES:
    m = ob.modifiers.new("Armature", "ARMATURE")
    m.object = ARM
ext.vrm1.humanoid.pose = "restPositionPose"
log("t-pose baked")

"""Gaze starts between the eyes. The add-on writes this as-is, so it's in glTF axes (Y up, facing +Z)."""
eyes = sum((ARM.matrix_world @ ARM.data.bones[f"head eyeball {s}"].head_local for s in ("left", "right")), Vector()) / 2
d = eyes - ARM.matrix_world @ ARM.data.bones[HUMAN["head"]].head_local
ext.vrm1.look_at.offset_from_head_bone = (d.x, d.z, -d.y)
log("look-at offset", [round(v, 3) for v in (d.x, d.z, -d.y)])

# ---------------------------------------------------------------- joint helpers -> node constraints
"""
The game drove these helper bones procedurally; exported as-is they would follow their parent
rigidly and the joints would fold like hinges. Rotation constraints turn the knee, elbow, hip
and shoulder helpers partway with the joint (the hip and shoulder ones move up to the joint's
parent first, so they sit between the two); roll constraints spread the wrist's twist down the
forearm. Each helper's rest orientation is matched to its source so the local axes agree.
"""
HELPERS = []
for s, short in (("left", "l"), ("right", "r")):
    wrist_adj = "arm left wrist adj" if s == "left" else "arm right wrist adj 1"
    HELPERS += [
        (f"leg {s} knee adj 1", f"leg {s} knee", "rotation", 0.5, None),
        (f"leg {s} thigh adj 1", f"leg {s} thigh", "rotation", 0.5, "pelvis"),
        (f"leg {s} butt", f"leg {s} thigh", "rotation", 0.4, "pelvis"),
        (f"arm {s} shoulder adj 1", f"arm {s} shoulder 2", "rotation", 0.5, f"arm {s} shoulder 1"),
        (f"arm {s} elbow adj", f"arm {s} elbow", "rotation", 0.5, None),
        (f"unused b {short} forearm helper4", f"arm {s} wrist", "roll", 0.15, None),
        (f"unused arm {s} elbow adj 3", f"arm {s} wrist", "roll", 0.35, None),
        (wrist_adj, f"arm {s} wrist", "roll", 0.5, None),
        (f"unused b {short} forearm helper2", f"arm {s} wrist", "roll", 0.5, None),
        (f"unused b {short} forearm helper1", f"arm {s} wrist", "roll", 0.75, None),
    ]

select_only([ARM], ARM)
bpy.ops.object.mode_set(mode="EDIT")
eb = ARM.data.edit_bones
for dst, src, kind, _w, parent in HELPERS:
    d, s_ = eb[dst], eb[src]
    if parent:
        d.parent = eb[parent]
    if kind == "rotation":
        d.tail = d.head + (s_.tail - s_.head).normalized() * d.length
    else:
        forearm = eb[src].parent
        d.tail = d.head + (forearm.tail - forearm.head).normalized() * d.length
    d.align_roll(s_.z_axis)
bpy.ops.object.mode_set(mode="POSE")
for dst, src, kind, w, _parent in HELPERS:
    c = ARM.pose.bones[dst].constraints.new("COPY_ROTATION")
    c.target = ARM
    c.subtarget = src
    c.mix_mode = "ADD"
    c.owner_space = "LOCAL"
    c.target_space = "LOCAL"
    c.use_x = c.use_z = kind == "rotation"
    c.use_y = True
    c.influence = w
bpy.ops.object.mode_set(mode="OBJECT")
log("constraints", len(HELPERS))

# ---------------------------------------------------------------- face shape keys
"""
Expressions as bone moves in world space (meters, Z up, she faces -Y, her left is +X):
("t", bone, (dx, dy, dz)) translates; ("r", bone, degrees) rotates about the X axis through the
bone's head (positive tips a forward point down). "L"/"R" in a name expands to both sides,
mirroring dx; blinkLeft/blinkRight use only one side.
"""
MM = 0.001
FORWARD = -1  # +Y is backward


def side(name, s):
    return name.replace("{s}", s)


EXPR = {
    "aa": [("r", "head jaw", 15), ("t", "head mouth corner {s}", (-1.0 * MM, 0, -1 * MM))],
    "ih": [("r", "head jaw", 6), ("t", "head mouth corner {s}", (2.5 * MM, 0, 0.5 * MM))],
    "ou": [("r", "head jaw", 5), ("t", "head mouth corner {s}", (-4.5 * MM, FORWARD * 2 * MM, 0)),
           ("t", "head lip upper middle", (0, FORWARD * 3 * MM, 0)), ("t", "head lip lower middle", (0, FORWARD * 3 * MM, 0))],
    "ee": [("r", "head jaw", 4), ("t", "head mouth corner {s}", (4 * MM, 0, 1 * MM))],
    "oh": [("r", "head jaw", 11), ("t", "head mouth corner {s}", (-3 * MM, FORWARD * 1.5 * MM, 0)),
           ("t", "head lip lower middle", (0, FORWARD * 1.5 * MM, 0))],
    "blink": [("r", "head eyelid {s} upper", 38), ("r", "head eyelid {s} lower", -9)],
    "blinkLeft": [("r", "head eyelid left upper", 38), ("r", "head eyelid left lower", -9)],
    "blinkRight": [("r", "head eyelid right upper", 38), ("r", "head eyelid right lower", -9)],
    "happy": [("t", "head mouth corner {s}", (4 * MM, 1.5 * MM, 7 * MM)), ("t", "head cheek {s} 2", (0, 0, 4 * MM)),
              ("t", "head cheek {s} 1", (1 * MM, 0, 4 * MM)), ("r", "head eyelid {s} lower", -10),
              ("t", "head eyebrow {s} 2", (0, 0, 2 * MM))],
    "angry": [("t", "head eyebrow {s} 1", (-3 * MM, 0, -6 * MM)), ("t", "head eyebrow {s} 2", (-1 * MM, 0, -4 * MM)),
              ("t", "head eyebrow {s} 3", (0, 0, 1 * MM)), ("r", "head eyelid {s} upper", 10),
              ("r", "head eyelid {s} lower", -6), ("t", "head mouth corner {s}", (-1 * MM, 0, -3 * MM))],
    "sad": [("t", "head eyebrow {s} 1", (0, 0, 6 * MM)), ("t", "head eyebrow {s} 3", (0, 0, -2.5 * MM)),
            ("r", "head eyelid {s} upper", 12), ("t", "head mouth corner {s}", (-1 * MM, 0, -6 * MM)),
            ("t", "head lip lower middle", (0, FORWARD * 1.5 * MM, 1 * MM))],
    "relaxed": [("r", "head eyelid {s} upper", 18), ("r", "head eyelid {s} lower", -5),
                ("t", "head mouth corner {s}", (2 * MM, 0, 3 * MM))],
    "surprised": [("t", "head eyebrow {s} 1", (0, 0, 6 * MM)), ("t", "head eyebrow {s} 2", (0, 0, 7 * MM)),
                  ("t", "head eyebrow {s} 3", (0, 0, 5 * MM)), ("r", "head eyelid {s} upper", -10),
                  ("r", "head jaw", 9)],
}


def pose_expression(moves):
    for pb in ARM.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    for kind, bone, amount in moves:
        sides = ("left", "right") if "{s}" in bone else (None,)
        for s in sides:
            name = side(bone, s) if s else bone
            pb = ARM.pose.bones[name]
            rest = pb.bone.matrix_local.copy()
            if kind == "t":
                dx, dy, dz = amount
                mirror = -1 if s == "right" else 1
                pb.matrix = Matrix.Translation(TO_ARM @ Vector((dx * mirror, dy, dz))) @ rest
            else:
                p = rest.to_translation()
                axis = (TO_ARM @ Vector((1, 0, 0))).normalized()
                pb.matrix = Matrix.Translation(p) @ Matrix.Rotation(math.radians(amount), 4, axis) @ Matrix.Translation(-p) @ rest
            bpy.context.view_layer.update()


FACE_MESHES = [bpy.data.objects["body"], bpy.data.objects["eyelashes"]]
for ob in FACE_MESHES:
    if not ob.data.shape_keys:
        ob.shape_key_add(name="Basis", from_mix=False)
for key, moves in EXPR.items():
    pose_expression(moves)
    for ob in FACE_MESHES:
        select_only([ob], ob)
        mod = next(m for m in ob.modifiers if m.type == "ARMATURE")
        bpy.ops.object.modifier_apply_as_shapekey(keep_modifier=True, modifier=mod.name)
        ob.data.shape_keys.key_blocks[-1].name = key
pose_expression([])
log("shape keys", list(EXPR))

PRESET = {"aa": "aa", "ih": "ih", "ou": "ou", "ee": "ee", "oh": "oh", "blink": "blink", "blinkLeft": "blink_left",
          "blinkRight": "blink_right", "happy": "happy", "angry": "angry", "sad": "sad", "relaxed": "relaxed",
          "surprised": "surprised"}
preset = ext.vrm1.expressions.preset
for key, prop in PRESET.items():
    e = getattr(preset, prop)
    for ob in FACE_MESHES:
        b = e.morph_target_binds.add()
        b.node.mesh_object_name = ob.name
        b.index = key
        b.weight = 1.0
    if key.startswith("blink"):
        e.is_binary = False
for prop in ("happy", "angry", "sad", "relaxed", "surprised"):
    getattr(preset, prop).override_blink = "blend"

# ---------------------------------------------------------------- materials
"""
Greyscale diffuse as base color (the hologram tint happens in the app shader), tangent-space
normals, and the control map in the emissive slot as data: R fine circuits, G suit panels,
B region mask, A main circuit traces.
"""


def image(name, data=False):
    img = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    return img


def rebuild(mat_name, new_name, diff, normal=None, control=None, alpha=False):
    m = bpy.data.materials[mat_name]
    m.name = new_name
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image(diff)
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    if normal:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = image(normal, data=True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if control:
        c = nt.nodes.new("ShaderNodeTexImage")
        c.image = image(control, data=True)
        nt.links.new(c.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.45


rebuild("cortana_body", "nova_body", "storm_cortana_default_body_diff.png", "storm_cortana_default_body_normal.png",
        "storm_cortana_default_body_control.png")
rebuild("cortana_head", "nova_head", "storm_cortana_default_head_diff.png", "storm_cortana_default_head_normal.png",
        "storm_cortana_default_head_control.png")
rebuild("cortana_eyes", "nova_eye", "storm_cortana_default_eye_diff.png", "storm_cortana_default_eye_iris_normal.png")
rebuild("cortana_hair", "nova_hair", "storm_cortana_default_hair_diff.png", "storm_cortana_default_hair_normal.png",
        alpha=True)
rebuild("cortana_hair_eyelashes.001", "nova_lashes", "storm_cortana_default_hair_diff.png", alpha=True)
for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)

# ---------------------------------------------------------------- save / export
if DEBUG_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=DEBUG_BLEND, copy=True)
    log("saved", DEBUG_BLEND)
if OUT:
    select_only([ARM], ARM)
    res = bpy.ops.export_scene.vrm(filepath=OUT, armature_object_name=ARM.name, ignore_warning=True)
    log("export", res, OUT, os.path.getsize(OUT) if os.path.exists(OUT) else "missing")
