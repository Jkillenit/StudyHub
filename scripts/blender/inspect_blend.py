"""Dump a .blend's meshes, armatures, shape keys and materials as JSON.

blender -b file.blend --python scripts/blender/inspect_blend.py -- out.json
"""
import bpy, json, sys

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None


def tex_nodes(mat):
    if not mat or not mat.use_nodes:
        return []
    res = []
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            links = [f"{l.to_node.name}.{l.to_socket.name}" for o in n.outputs for l in o.links]
            res.append({"node": n.name, "image": n.image.name, "file": n.image.filepath,
                        "size": list(n.image.size), "cs": n.image.colorspace_settings.name, "to": links})
    return res


data = {"objects": [], "materials": {}, "armatures": {}, "actions": [a.name for a in bpy.data.actions]}
for ob in bpy.data.objects:
    e = {"name": ob.name, "type": ob.type, "parent": ob.parent.name if ob.parent else None,
         "parent_type": ob.parent_type, "dims": [round(v, 4) for v in ob.dimensions],
         "loc": [round(v, 4) for v in ob.location], "scale": [round(v, 4) for v in ob.scale],
         "rot": [round(v, 4) for v in ob.rotation_euler], "hidden": ob.hide_render,
         "modifiers": [(m.type, getattr(m, "object", None) and m.object.name) for m in ob.modifiers]}
    if ob.type == "MESH":
        me = ob.data
        me.calc_loop_triangles()
        e.update(verts=len(me.vertices), tris=len(me.loop_triangles),
                 uv_layers=[u.name for u in me.uv_layers],
                 color_attrs=[c.name for c in me.color_attributes],
                 vgroups=len(ob.vertex_groups),
                 vgroup_names=[g.name for g in ob.vertex_groups][:400],
                 shape_keys=[k.name for k in me.shape_keys.key_blocks] if me.shape_keys else [],
                 materials=[s.material.name if s.material else None for s in ob.material_slots])
    data["objects"].append(e)

for mat in bpy.data.materials:
    data["materials"][mat.name] = {"users": mat.users, "blend": getattr(mat, "blend_method", None),
                                   "textures": tex_nodes(mat),
                                   "nodes": [n.type for n in mat.node_tree.nodes] if mat.use_nodes else []}

for arm in bpy.data.armatures:
    data["armatures"][arm.name] = [{"name": b.name, "parent": b.parent.name if b.parent else None,
                                    "head": [round(v, 4) for v in b.head_local],
                                    "tail": [round(v, 4) for v in b.tail_local]} for b in arm.bones]

txt = json.dumps(data, indent=1)
if out:
    open(out, "w").write(txt)
else:
    print(txt)
