"""Workbench renders of a converted Nova .blend for eyeballing: body, every face shape key, a joint stress pose.

blender -b nova_converted.blend --python scripts/blender/render_check.py -- <out_dir>
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(OUT, exist_ok=True)
ARM = bpy.data.objects["Armature"]
TO_ARM = ARM.matrix_world.inverted().to_3x3()
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.render.film_transparent = False
scene.render.resolution_percentage = 100

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(name, center, scale, side=False, res=(600, 600)):
    scene.render.resolution_x, scene.render.resolution_y = res
    cam_data.ortho_scale = scale
    c = Vector(center)
    if side:
        cam.location = c + Vector((3, 0, 0))
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    else:
        cam.location = c + Vector((0, -3, 0))
        cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)


def keys(value_by_name):
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.data.shape_keys:
            for kb in ob.data.shape_keys.key_blocks[1:]:
                kb.value = value_by_name.get(kb.name, 0.0)


def head_world(bone):
    return ARM.matrix_world @ ARM.pose.bones[bone].head


shoot("body_front", (0, 0, 0.87), 1.95, res=(700, 700))
shoot("body_side", (0, 0, 0.87), 1.95, side=True, res=(700, 700))

eye_mid = (head_world("head eyeball left") + head_world("head eyeball right")) / 2
face_center = eye_mid + Vector((0, 0, -0.035))
names = [kb.name for kb in bpy.data.objects["body"].data.shape_keys.key_blocks[1:]]
keys({})
shoot("face_neutral", face_center, 0.2, res=(360, 360))
for n in names:
    keys({n: 1.0})
    shoot("face_" + n, face_center, 0.2, res=(360, 360))
keys({})


def turn(bone, axis, deg):
    pb = ARM.pose.bones[bone]
    p = pb.matrix.to_translation()
    a = (TO_ARM @ Vector(axis)).normalized()
    pb.matrix = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, a) @ Matrix.Translation(-p) @ pb.matrix
    bpy.context.view_layer.update()


def reset():
    for pb in ARM.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()


for s, sign in (("left", 1), ("right", -1)):
    turn(f"leg {s} thigh", (1, 0, 0), -90)
    turn(f"leg {s} knee", (1, 0, 0), 95)
    turn(f"arm {s} shoulder 2", (0, sign, 0), 72)
shoot("sit_front", (0, 0, 1.0), 1.3, res=(700, 700))
shoot("sit_side", (0, 0, 1.0), 1.3, side=True, res=(700, 700))
reset()
for s, sign in (("left", 1), ("right", -1)):
    turn(f"arm {s} elbow", (0, 0, 1), sign * 100)
    turn(f"arm {s} wrist", (sign, 0, 0), 70)
shoot("arms_front", (0, 0, 1.3), 1.0, res=(700, 700))
reset()
