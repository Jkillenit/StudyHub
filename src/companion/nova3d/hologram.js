/**
 * Nova's hologram shader. Nova's own look is driven by the model's maps: the greyscale diffuse
 * tinted to `uColor`, tangent-space normals, the control map (R fine circuits, G suit panels,
 * B region mask, A main circuit traces; the eye's is R iris fibers, G iris glow, B iris disc)
 * and, on the body, the code-flow map with pulses running along its traces. The Zombies pack
 * keeps its own branch. Both share the gather dissolve and the depth prepass.
 */
export const VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform float uTime;
uniform float uGlitch;
uniform float uHeight;
uniform float uRestH;
uniform float uZombie;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vViewPos;
void main() {
  vUv = uv;
  vRest = position / uRestH;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  vRestN = objectNormal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vH = wp.y / uHeight;
  float slice = floor(vH * 22.0) + floor(uTime * 14.0);
  float hit = step(0.78, fract(sin(slice * 12.9898) * 43758.5453));
  mvPosition.x += uGlitch * hit * (fract(sin(slice * 78.233) * 9631.17) - 0.5) * uHeight * mix(0.04, 0.09, uZombie);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uHasMap;
uniform sampler2D uNormalMap;
uniform float uHasNormal;
uniform sampler2D uCtrl;
uniform float uHasCtrl;
uniform float uFlowT;
uniform float uCut;
uniform float uDepthOnly;
uniform float uTime;
uniform float uGlow;
uniform float uFade;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uZombie;
uniform float uFlicker;
uniform vec3 uEyeColor;
uniform float uEye;
uniform float uWear;
uniform float uResolve;
varying vec2 vUv;
varying vec3 vN;
varying float vH;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vViewPos;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
/* Tangent frame from screen derivatives (the model ships no tangents); handles mirrored UVs. */
mat3 tangentFrame(vec3 p, vec3 n, vec2 uv) {
  vec3 q0 = dFdx(p);
  vec3 q1 = dFdy(p);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 q1perp = cross(q1, n);
  vec3 q0perp = cross(n, q0);
  vec3 t = q1perp * st0.x + q0perp * st1.x;
  vec3 b = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(t, t), dot(b, b));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(t * s, b * s, n);
}
void main() {
  vec4 tex = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  if (tex.a < uCut) discard;
  /* Gathering out of the particle field: noise weighted by rest height, so she resolves feet first with a bright edge. */
  float rd = mix(vnoise(vRest * 18.0), clamp(vRest.y, 0.0, 1.0), 0.6);
  float rcut = uResolve * 1.12 - 0.06;
  if (rd > rcut) discard;
  float redge = 1.0 - smoothstep(0.0, 0.06, rcut - rd);
  /* Zombies pack wear, in rest-pose space (height 1, T-pose arms along x) so it sticks to her as she moves. */
  float burn = 0.0;
  float bare = 0.0;
  if (uZombie > 0.5 && uWear > 0.5) {
    vec3 r = vRest;
    float w = 0.0;
    if (uWear < 1.5) {
      /* Suit torn off raggedly at mid-shin and mid-forearm; the limb below shows through faded. */
      float jag = vnoise(vec3(r.x * 55.0, r.y * 9.0, r.z * 55.0)) * 0.05;
      float hem = max(0.17 + jag - r.y, abs(r.x) - 0.33 + jag);
      bare = step(0.0, hem);
      burn = smoothstep(0.012, 0.0, abs(hem));
      if (r.y < 0.78 || abs(r.x) > 0.13) w = 0.36 + 0.14 * bare;
    } else {
      w = 0.8 * smoothstep(0.885, 0.84, r.y);
    }
    float n = vnoise(r * 16.0) * 0.65 + vnoise(r * 70.0) * 0.35;
    float cut = w * 0.6;
    if (n < cut) discard;
    if (w > 0.0) burn = max(burn, smoothstep(cut + 0.08, cut, n));
  }
  if (uDepthOnly > 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  float band = smoothstep(0.045, 0.0, abs(vH - (fract(uTime * 0.21) * 1.4 - 0.2)));
  vec3 col;
  float a;
  if (uZombie > 0.5) {
    float fres = pow(1.0 - clamp(abs(normalize(vN).z), 0.0, 1.0), 2.0);
    float scan = 0.8 + 0.2 * step(0.5, fract(gl_FragCoord.y * 0.33));
    float flick = 0.93 + 0.07 * step(0.12, fract(sin(floor(uTime * 9.0) * 91.7) * 311.3));
    col = uColor * (0.3 + 1.1 * lum) + uHot * fres * (0.45 + 0.2 * uGlow) + uHot * band * 0.3;
    a = clamp((0.6 + 0.3 * lum + fres * 0.55 + band * 0.2) * scan * flick * uFade, 0.0, 1.0);
    a *= min(1.0, tex.a * 1.5);
    if (uEye > 0.5) {
      col = uEyeColor * (uEye > 1.5 ? 0.9 : 1.3 + 0.8 * lum);
      a = clamp(tex.a * 1.5, 0.0, 1.0) * uFade;
    } else {
      float grime = smoothstep(0.4, 0.75, vnoise(vRest * 7.0 + 3.1));
      float streak = smoothstep(0.5, 0.85, vnoise(vec3(vRest.x * 34.0, vRest.y * 3.0, vRest.z * 34.0)));
      col *= 1.0 - (0.6 * grime + 0.4 * streak) * (uWear > 0.5 ? 1.0 : 0.45);
      col *= 1.0 - 0.45 * bare;
      a *= 1.0 - 0.55 * bare;
      col = mix(col, uEyeColor * 1.3, burn * 0.85);
      a = max(a, burn * 0.9 * uFade);
    }
    col *= uFlicker;
    a *= mix(1.0, uFlicker, 0.6);
  } else {
    /* Lit in view space by a soft key (upper left), a fill (right) and a top light; wrap terms keep the shadows open like light through skin. */
    vec3 Ng = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 V = normalize(-vViewPos);
    vec3 N = Ng;
    if (uHasNormal > 0.5) {
      vec3 mn = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      mn.xy *= 0.9;
      N = normalize(tangentFrame(vViewPos, Ng, vUv) * mn);
    }
    vec4 ctrl = uHasCtrl > 0.5 ? texture2D(uCtrl, vUv) : vec4(0.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float edge = 1.0 - clamp(dot(Ng, V), 0.0, 1.0);
    vec3 keyL = normalize(vec3(-0.45, 0.6, 0.65));
    vec3 fillL = normalize(vec3(0.6, -0.1, 0.8));
    float key = clamp((dot(N, keyL) + 0.45) / 1.45, 0.0, 1.0);
    float fill = clamp((dot(N, fillL) + 0.3) / 1.3, 0.0, 1.0);
    float top = clamp(N.y, 0.0, 1.0);
    float sss = smoothstep(-0.6, 1.0, dot(N, keyL));
    float spec = pow(clamp(dot(N, normalize(keyL + V)), 0.0, 1.0), 48.0);
    float rim = pow(edge, 5.5);
    float fres = pow(edge, 2.0);
    float hair = step(1.5, uWear);
    float detail = mix(0.3, 1.0, lum) * mix(1.0, 0.55, hair);
    vec3 skin = mix(uColor, uHot, 0.2);
    col = skin * (0.14 + 0.9 * key * key * detail + 0.16 * fill * detail + 0.15 * top * detail);
    col += skin * sss * 0.22 * (1.0 - rim);
    col = mix(col, uHot, pow(key, 7.0) * detail * 0.35);
    col += uHot * spec * mix(0.35, 0.5, hair) * detail;
    col += mix(uColor, uHot, 0.6) * rim * (1.1 + 0.3 * uGlow);
    /* Circuits glow from the control map; a slow wave of brightness climbs her body. */
    float wave = 0.7 + 0.3 * sin(uFlowT * 1.1 - vH * 7.0);
    float lines = clamp(ctrl.a * 0.8 + ctrl.r * 0.15, 0.0, 1.0) * (1.0 - hair);
    float pulse = smoothstep(0.9, 1.0, fract(vH * 2.5 - uFlowT * 0.12));
    float glow = lines * (0.7 * wave + 1.1 * pulse);
    col += mix(uColor, uHot, 0.55) * glow;
    col += uHot * band * 0.06;
    float lit = 0.0;
    if (uEye > 0.5) {
      /* Dim whites, a lit iris with a dark pupil, and a wet highlight off the eyeball's own curve. */
      float iris = ctrl.b;
      float pupil = smoothstep(0.06, 0.2, lum);
      vec3 white = uColor * (0.06 + 0.12 * lum);
      vec3 ring = mix(uColor, uHot, 0.3) * (0.25 + 1.3 * ctrl.r + 0.5 * ctrl.g) * pupil;
      col = mix(white, ring, iris);
      float wet = pow(clamp(dot(reflect(-keyL, Ng), V), 0.0, 1.0), 90.0);
      col += uHot * wet * 1.6;
      lit = iris * 0.5 + wet;
    }
    /* See-through facing the camera, solid toward the silhouette; glowing lines are denser. */
    a = 0.56 + 0.16 * lum + 0.12 * ctrl.g + 0.5 * fres + 0.3 * rim + 0.4 * glow + 0.25 * spec + lit;
    a = clamp(a * uFade, 0.0, 1.0);
    a *= min(1.0, tex.a * 1.5);
  }
  col = mix(col, (uZombie > 0.5 ? uEyeColor : uHot) * 1.6, redge);
  a = max(a, redge * uFade);
  gl_FragColor = vec4(col * a, a);
}
`;
