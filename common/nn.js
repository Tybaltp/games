// Shared by the pages whose computer has a neural network (Volo, Ayu, Slither…), loaded in the search worker by the
// page's /*NN*/ block (importScripts, before the first search). NNSession(bytes, dims, outs) picks how the network is
// computed and gives {ort, sess, ep}: sess.run(feeds) as onnxruntime-web's, returning the outputs `outs` only.
//
// Why (20.11.2026): a level is a number of visits, never a time, so a faster device plays the same moves sooner.
// The order tried: WebGPU, then WASM (several threads when the page is cross-origin isolated, which GitHub Pages is
// not: one thread there). WebGL is not tried: onnxruntime-web's WebGL backend cannot run these networks (no ReduceSum
// at opset 17, measured on Chrome, 20.11.2026). A short test on a control input (pseudo-random planes, the same every
// time): WebGPU is kept only if its outputs match WASM's (|a-b| ≤ 1e-3 + 1e-2·|a|) and it answers at least 10 % faster;
// any failure (no adapter, an error, a mismatch, a lost device later) leaves WASM, with nothing shown to the player.
// Without WebGPU in the browser nothing changes from before: ort.wasm.min.js, one thread.
(function () {
const ORT = 'onnxruntime-web@1.20.1';
const CDN = ['https://cdn.jsdelivr.net/npm/' + ORT + '/dist/', 'https://unpkg.com/' + ORT + '/dist/'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
async function hasGPU() {
  try { return !!(typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch (e) { return false; }
}
function control(dims) {   // the control input: planes of 0 and 1, from a fixed seed
  const n = dims.reduce((a, b) => a * b, 1), x = new Float32Array(n); let s = 12345;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; x[i] = s < 0x26666666 ? 1 : 0; }   // ~30 % ones
  return x;
}
const same = (A, B, outs) => outs.every(k => { const a = A[k].data, b = B[k] && B[k].data; if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!(Math.abs(a[i] - b[i]) <= 1e-3 + 1e-2 * Math.abs(a[i]))) return false; return true; });
async function timed(s, feed, outs, n) {   // ms per call, after 3 warm-up calls
  for (let i = 0; i < 3; i++) await s.run(feed(), outs);
  const t = now(); for (let i = 0; i < n; i++) await s.run(feed(), outs); return (now() - t) / n;
}
self.NNSession = async function (bytes, dims, outs) {
  const gpu = await hasGPU();
  let dir = null;
  for (const d of CDN) { try { importScripts(d + (gpu ? 'ort.webgpu.min.js' : 'ort.wasm.min.js')); dir = d; break; } catch (e) {} }
  if (!dir) throw new Error('onnxruntime-web unavailable');
  const ort = self.ort, hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 1;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, hc - 1)) : 1;
  ort.env.wasm.wasmPaths = dir;
  const opts = ep => ({executionProviders: [ep], graphOptimizationLevel: 'all'});
  const cpu = await ort.InferenceSession.create(bytes, opts('wasm'));
  const wrap = (s, ep) => ({ep, run: f => s.run(f, outs)});
  let best = wrap(cpu, 'wasm' + (ort.env.wasm.numThreads > 1 ? '-' + ort.env.wasm.numThreads : ''));
  if (gpu) {
    let g = null;
    try {
      const x = control(dims), feed = () => ({x: new ort.Tensor('float32', x, dims)});
      const ref = await cpu.run(feed(), outs);
      g = await ort.InferenceSession.create(bytes, opts('webgpu'));
      if (same(ref, await g.run(feed(), outs), outs)) {
        const tc = await timed(cpu, feed, outs, 12), tg = await timed(g, feed, outs, 12);
        self.NN_TEST = {wasm: tc, webgpu: tg};
        if (tg < .9 * tc) {
          const G = g; g = null; let lost = false;
          // a lost GPU device (or any error) later: WASM from then on, and the call is made again there
          best = {ep: 'webgpu', run: f => lost ? cpu.run(f, outs) : G.run(f, outs).catch(() => { lost = true; best.ep = 'wasm'; return cpu.run(f, outs); })};
        }
      } else self.NN_TEST = {mismatch: true};
    } catch (e) { self.NN_TEST = {error: String(e && e.message || e)}; }
    if (g) try { g.release(); } catch (e) {}
  }
  self.NN_EP = best.ep;
  return {ort, sess: best, ep: best.ep};
};
})();
