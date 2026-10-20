// Optional CRT display: the game still draws its 768x432 picture into the 2D canvas, and with
// the CRT on, a WebGL canvas laid over it redraws that picture at the screen's real resolution
// through a shader: an arcade monitor, with glowing scanlines that swell on bright colours, an
// aperture grille, a slight curve to the glass and darker corners. (From the golden-axe port.)

const VERT = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

// An arcade monitor: each line is a beam whose height grows with its brightness,
// colours blend sideways a little, an aperture grille splits the output into RGB stripes, and
// the glass is slightly curved with darker corners.
const CRT = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 srcSize;
uniform vec2 outSize;
out vec4 color;
vec3 lin(vec3 c) { return pow(c, vec3(2.4)); }
vec3 at(ivec2 p) { return lin(texelFetch(src, clamp(p, ivec2(0), ivec2(srcSize) - 1), 0).rgb); }
// The maze is drawn at twice Gauntlet's size, so each scanline is two rows of the canvas:
// 216 lines, like the arcade's monitor, rather than 432 too fine to see.
const int ROWS = 2;
// one line of the picture at x, blending neighbouring pixels sideways
vec3 line(float x, int y) {
  float fx = x - 0.5, f = fract(fx);
  int x0 = int(floor(fx));
  float s = smoothstep(0.2, 0.8, f);
  vec3 c = vec3(0.0);
  for (int r = 0; r < ROWS; r++) c += mix(at(ivec2(x0, y * ROWS + r)), at(ivec2(x0 + 1, y * ROWS + r)), s);
  return c / float(ROWS);
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x, outSize.y - gl_FragCoord.y) / outSize;
  // curved glass
  vec2 cc = uv * 2.0 - 1.0;
  cc *= 1.0 + vec2(0.035, 0.05) * (cc.yx * cc.yx);
  uv = cc * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { color = vec4(0, 0, 0, 1); return; }
  vec2 pos = uv * srcSize / vec2(1, ROWS);
  int y0 = int(floor(pos.y - 0.5));
  float dy = pos.y - 0.5 - float(y0);
  vec3 a = line(pos.x, y0), b = line(pos.x, y0 + 1);
  // beams: wider for brighter colours
  vec3 wa = 0.24 + 0.16 * sqrt(a), wb = 0.24 + 0.16 * sqrt(b);
  vec3 col = a * exp(-dy * dy / (2.0 * wa * wa)) + b * exp(-(1.0 - dy) * (1.0 - dy) / (2.0 * wb * wb));
  // aperture grille, three output pixels to a triad
  int m = int(mod(gl_FragCoord.x, 3.0));
  vec3 mask = vec3(0.75);
  mask[m] = 1.15;
  col *= mask * 1.65;
  // darker corners
  vec2 v = uv * (1.0 - uv);
  col *= clamp(pow(v.x * v.y * 18.0, 0.18), 0.0, 1.0);
  color = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

/** the display modes, in the order the F key cycles through them */
export const MODES = [
  { name: 'ORIGINAL', frag: '' },
  { name: 'CRT', frag: CRT },
] as { name: string; frag: string }[];

interface Program {
  prog: WebGLProgram;
  srcSize: WebGLUniformLocation | null;
  outSize: WebGLUniformLocation | null;
}

export class Filter {
  readonly canvas = document.createElement('canvas');
  /** index into MODES; 0 is the original picture */
  mode = 0;
  private gl: WebGL2RenderingContext | null;
  private tex: WebGLTexture | null = null;
  private progs: (Program | null)[] = [];

  constructor(private src: HTMLCanvasElement) {
    this.canvas.id = 'screen-gl';
    src.after(this.canvas);
    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
    if (this.gl) this.init(this.gl);
    this.show();
  }

  /** the modes this browser can show (just the original without WebGL2) */
  get modes() {
    return MODES.filter((_m, i) => i === 0 || this.progs[i]);
  }

  get name() {
    return MODES[this.mode].name;
  }

  private init(gl: WebGL2RenderingContext) {
    const shader = (type: number, text: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const vert = shader(gl.VERTEX_SHADER, VERT);
    this.progs = MODES.map(({ frag }) => {
      if (!frag) return null;
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vert);
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(prog, 0, 'pos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
        return null;
      }
      gl.useProgram(prog);
      gl.uniform1i(gl.getUniformLocation(prog, 'src'), 0);
      return { prog, srcSize: gl.getUniformLocation(prog, 'srcSize'), outSize: gl.getUniformLocation(prog, 'outSize') };
    });
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
  }

  /** Switch to a mode by name (unknown or unavailable names give the original). */
  setMode(name: string) {
    const i = MODES.findIndex((m) => m.name === name);
    this.mode = i > 0 && this.progs[i] ? i : 0;
    this.show();
    this.render();
  }

  /** The next available mode along. */
  cycle() {
    const names = this.modes.map((m) => m.name);
    this.setMode(names[(names.indexOf(this.name) + 1) % names.length]);
  }

  private show() {
    this.canvas.style.display = this.progs[this.mode] ? 'block' : 'none';
    if (this.progs[this.mode]) this.fit();
  }

  /** Lay the filter canvas exactly over the game's, at the display's real pixel size. */
  fit() {
    if (!this.progs[this.mode]) return;
    const r = this.src.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    Object.assign(this.canvas.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Redraw the game's latest frame through the current filter. */
  render() {
    const gl = this.gl, p = this.progs[this.mode];
    if (!this.mode || !gl || !p) return;
    gl.useProgram(p.prog);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);
    gl.uniform2f(p.srcSize, this.src.width, this.src.height);
    gl.uniform2f(p.outSize, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
