/* Artifact Simulator: a static rebuild of the "Bias and Artifacts" Shiny app.
   No dependencies. Markup lives in artifact-simulator.qmd, styles in
   simulator.css. Sections:
     1. controls, presets     5. corrections
     2. random numbers        6. theory (closed-form formulas)
     3. helpers               7. rendering (sample, replications, bias breakdown)
     4. the two models        8. export, URL state, wiring            */
(function () {
  "use strict";
  var app = document.getElementById("as-app");
  if (!app) return;
  var NS = "http://www.w3.org/2000/svg";

  // ======================================================= 1. controls
  function show(fn) { return fn; }
  var GROUPS = {
    r: [
      { title: "Effect", items: [
        { id: "n", info: "Number of people simulated before any selection. Larger samples shrink sampling error but don't remove bias.", label: "Sample size (before selection)", min: 20, max: 800, step: 20, val: 200, dp: 0 },
        { id: "rho", info: "The correlation between the true scores of X and Y, free of every artifact. This is what the study is trying to estimate.", label: "True correlation", min: 0, max: 0.9, step: 0.05, val: 0.5 }] },
      { title: "Measurement error", toggle: "err", items: [
        { id: "rxx", info: "Share of the variance in observed X that is true-score variance. 1 means X is measured perfectly; lower values add random error that shrinks the correlation.", label: "Reliability of X", min: 0.1, max: 1, step: 0.05, val: 0.7 },
        { id: "ryy", info: "Share of the variance in observed Y that is true-score variance. 1 means Y is measured perfectly; lower values add random error that shrinks the correlation.", label: "Reliability of Y", min: 0.1, max: 1, step: 0.05, val: 0.7 },
        { id: "re", info: "Correlation between the measurement errors in X and Y, as when both come from the same rater, method, or questionnaire. Positive values inflate the observed correlation; the usual correction assumes 0.", label: "Correlation between the errors", min: -0.5, max: 0.8, step: 0.05, val: 0 }] },
      { title: "Range restriction", toggle: "rr", items: [
        { id: "rr", info: "Direct: people are selected on X and/or Y themselves. Indirect: they are selected on a third variable, Z, that is related to both.", label: "Selection on", type: "radio", options: ["Direct", "Indirect"], val: "Direct" },
        { id: "srx", info: "Share of the sample kept, taking the highest scorers on observed X. 1 means no selection on X.", label: "Selection ratio of X", min: 0.2, max: 1, step: 0.05, val: 0.75, show: show(function (s) { return s.rr === "Direct"; }) },
        { id: "sry", info: "Share of the sample kept, taking the highest scorers on observed Y. 1 means no selection on Y.", label: "Selection ratio of Y", min: 0.2, max: 1, step: 0.05, val: 0.75, show: show(function (s) { return s.rr === "Direct"; }) },
        { id: "srz", info: "Share of the sample kept, taking the highest scorers on the selector Z. 1 means no selection.", label: "Selection ratio of Z", min: 0.2, max: 1, step: 0.05, val: 0.75, show: show(function (s) { return s.rr === "Indirect"; }) },
        { id: "rz", info: "Correlation between the selector Z and the true scores of X and Y. The stronger it is, the more selecting on Z restricts X and Y.", label: "Correlation of X and Y with Z", min: 0, max: 0.7, step: 0.05, val: 0.7, show: show(function (s) { return s.rr === "Indirect"; }) },
        { id: "rzz", info: "Reliability of the selector Z. Selecting on a noisier Z restricts X and Y less.", label: "Reliability of Z", min: 0.1, max: 1, step: 0.05, val: 0.7, show: show(function (s) { return s.rr === "Indirect"; }) }] },
      { title: "Coarseness", toggle: "coarse", items: [
        { id: "kx", info: "Number of cut points used to turn X into categories. 0 keeps X continuous, 1 is a median split, and 4 cuts give a 5-point scale.", label: "Cuts in X", min: 0, max: 20, step: 1, val: 0, dp: 0, zero: "continuous" },
        { id: "ky", info: "Number of cut points used to turn Y into categories. 0 keeps Y continuous, 1 is a median split, and 4 cuts give a 5-point scale.", label: "Cuts in Y", min: 0, max: 20, step: 1, val: 0, dp: 0, zero: "continuous" }] },
      { title: "Display", items: [
        { id: "fit", info: "Adds the least-squares regression line for the selected points.", label: "Regression line", type: "radio", options: ["Yes", "No"], val: "No" }] }
    ],
    d: [
      { title: "Effect", items: [
        { id: "delta", info: "The true difference between the group means in within-group standard deviations (Cohen's d), free of every artifact.", label: "True standardized mean difference", min: 0, max: 2, step: 0.05, val: 0.5 },
        { id: "n", info: "Number of people simulated before any selection. Larger samples shrink sampling error but don't remove bias.", label: "Sample size (before selection)", min: 50, max: 1000, step: 50, val: 200, dp: 0 },
        { id: "pA", info: "Share of the sample that truly belongs to group A.", label: "Proportion of sample in group A", min: 0.2, max: 0.8, step: 0.05, val: 0.5 }] },
      { title: "Measurement error", toggle: "err", items: [
        { id: "ryy", info: "Reliability of the outcome Y. Lower reliability adds noise that shrinks the observed d by a factor of √reliability.", label: "Reliability of Y", min: 0.1, max: 1, step: 0.05, val: 1 }] },
      { title: "Misclassification", toggle: "mis", items: [
        { id: "pmis", info: "Chance that a person is recorded in the wrong group. Misclassification mixes the two groups and pulls their means together.", label: "Misclassification rate", min: 0, max: 0.3, step: 0.02, val: 0 }] },
      { title: "Range restriction", toggle: "sel", items: [
        { id: "srz", info: "Share of the sample kept, taking the highest scorers on the selector Z. 1 means no selection.", label: "Selection ratio of Z", min: 0.2, max: 1, step: 0.05, val: 1 },
        { id: "ryz", info: "Correlation between the selector Z and true Y. The stronger it is, the more selecting on Z restricts Y.", label: "Correlation between Y and Z", min: 0, max: 1, step: 0.05, val: 1 },
        { id: "rzz", info: "Reliability of the selector Z. Selecting on a noisier Z restricts Y less.", label: "Reliability of Z", min: 0.1, max: 1, step: 0.05, val: 1 }] },
      { title: "Coarseness", toggle: "coarse", items: [
        { id: "ky", info: "Number of cut points used to turn Y into categories. 0 keeps Y continuous, 1 is a median split, and 4 cuts give a 5-point scale.", label: "Cuts in Y", min: 0, max: 20, step: 1, val: 0, dp: 0, zero: "continuous" }] }
    ]
  };
  var TOGGLES = { r: ["err", "rr", "coarse"], d: ["err", "mis", "sel", "coarse"] };
  var PRESETS = {
    r: [
      { name: "Common method variance", set: { rho: 0.3, rxx: 0.7, ryy: 0.7, re: 0.4 }, on: { err: 1, rr: 0, coarse: 0 } },
      { name: "Median split", set: { rho: 0.5, kx: 1, ky: 0 }, on: { err: 0, rr: 0, coarse: 1 } },
      { name: "Likert survey", set: { rho: 0.5, rxx: 0.75, ryy: 0.75, kx: 4, ky: 4 }, on: { err: 1, rr: 0, coarse: 1 } },
      { name: "Clinical sample", set: { rho: 0.5, rxx: 0.8, ryy: 0.8, rr: "Indirect", srz: 0.2, rz: 0.6, rzz: 0.8 }, on: { err: 1, rr: 1, coarse: 0 } },
      { name: "Everything at once", set: { rho: 0.5, rxx: 0.7, ryy: 0.7, rr: "Direct", srx: 0.5, sry: 0.75, kx: 3, ky: 4 }, on: { err: 1, rr: 1, coarse: 1 } }
    ],
    d: [
      { name: "Noisy outcome", set: { delta: 0.5, ryy: 0.6 }, on: { err: 1, mis: 0, sel: 0, coarse: 0 } },
      { name: "Misdiagnosis", set: { delta: 0.5, pmis: 0.16 }, on: { err: 0, mis: 1, sel: 0, coarse: 0 } },
      { name: "Likert outcome", set: { delta: 0.5, ryy: 0.8, ky: 4 }, on: { err: 1, mis: 0, sel: 0, coarse: 1 } },
      { name: "Selected sample", set: { delta: 0.5, srz: 0.3, ryz: 0.6, rzz: 0.8 }, on: { err: 0, mis: 0, sel: 1, coarse: 0 } },
      { name: "Everything at once", set: { delta: 0.5, ryy: 0.7, pmis: 0.1, srz: 0.5, ryz: 0.6, rzz: 0.8, ky: 4 }, on: { err: 1, mis: 1, sel: 1, coarse: 1 } }
    ]
  };
  function items(key) { var o = []; GROUPS[key].forEach(function (g) { o = o.concat(g.items); }); return o; }
  function defaults(key) {
    var s = { on: {} };
    items(key).forEach(function (c) { s[c.id] = c.val; });
    TOGGLES[key].forEach(function (t) { s.on[t] = true; });
    return s;
  }
  var state = { r: defaults("r"), d: defaults("d") };
  var tab = "r", view = "sample", seed = 20240501, active = true;   // active: an r or d tab is showing

  // ================================================ 2. random numbers
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fillNormals(rng, out, n) {
    for (var i = 0; i < n; i += 2) {
      var m = Math.sqrt(-2 * Math.log(1 - rng())), v = 2 * Math.PI * rng();
      out[i] = m * Math.cos(v);
      if (i + 1 < n) out[i + 1] = m * Math.sin(v);
    }
    return out;
  }
  function fillUniform(rng, out, n) { for (var i = 0; i < n; i++) out[i] = rng(); return out; }
  var FIELDS = { r: { g1: 1, g2: 1, g3: 1, ex: 1, ey: 1, ez: 1 }, d: { u: 0, ey: 1, em: 1, ez: 1, ezm: 1, um: 0, jit: 0 } };
  function makeDraws(key, n) { var g = {}; for (var f in FIELDS[key]) g[f] = new Float64Array(n); return g; }
  function fillDraws(key, g, rng, n) {
    for (var f in FIELDS[key]) { if (FIELDS[key][f]) fillNormals(rng, g[f], n); else fillUniform(rng, g[f], n); }
    return g;
  }
  var SAMPLE = null;                          // draws for the plotted sample
  function drawSample() {
    var rng = mulberry32(seed);
    SAMPLE = { r: fillDraws("r", makeDraws("r", 800), rng, 800), d: fillDraws("d", makeDraws("d", 1000), rng, 1000) };
  }
  var NP = 60000, POP = null;                 // fixed large "population" for expected values
  function population() {
    if (!POP) {
      var rng = mulberry32(987654321);
      POP = { r: fillDraws("r", makeDraws("r", NP), rng, NP), d: fillDraws("d", makeDraws("d", NP), rng, NP) };
    }
    return POP;
  }

  // ======================================================== 3. helpers
  function normPdf(x) { return Math.exp(-0.5 * x * x) / 2.5066282746310002; }
  function normCdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var p = normPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }
  function qnorm(p) { // Acklam's rational approximation
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // variance ratio after keeping the top share p of a standard normal
  function truncVar(p) {
    if (p >= 1) return 1;
    var a = qnorm(1 - p), l = normPdf(a) / p;
    return 1 + a * l - l * l;
  }
  // coarseness: k cuts at equal widths across -3..3 SD, values replaced by bin midpoints
  function bins(k) { return k > 0 ? { k: k, w: 6 / (k + 1) } : null; }
  function co(v, b) {
    var i = Math.floor((v + 3) / b.w);
    if (i < 0) i = 0; else if (i > b.k) i = b.k;
    return -3 + (i + 0.5) * b.w;
  }
  function edges(b) { var e = [-Infinity]; for (var j = 1; j <= b.k; j++) e.push(-3 + j * b.w); e.push(Infinity); return e; }
  // E[h(Y)] and E[h(Y)^2] for Y ~ N(mu, 1) after binning
  function binMoments(mu, b) {
    var e = edges(b), m1 = 0, m2 = 0;
    for (var i = 0; i <= b.k; i++) {
      var p = normCdf(e[i + 1] - mu) - normCdf(e[i] - mu), c = -3 + (i + 0.5) * b.w;
      m1 += c * p; m2 += c * c * p;
    }
    return [m1, m2];
  }
  var CF = {};
  function cf(k) { // corr(X, binned X) for standard normal X
    if (!k) return 1;
    if (CF[k]) return CF[k];
    var b = bins(k), e = edges(b), cov = 0;
    for (var i = 0; i <= b.k; i++) cov += (-3 + (i + 0.5) * b.w) * (normPdf(e[i]) - normPdf(e[i + 1]));
    var m = binMoments(0, b);
    return (CF[k] = cov / Math.sqrt(m[1] - m[0] * m[0]));
  }
  // cutoff that keeps the top share p of v
  function cut(v, p) {
    if (p >= 1) return -Infinity;
    var s = Float64Array.from(v).sort();
    return s[Math.max(0, s.length - Math.ceil(p * s.length))];
  }
  function varOf(a, sel) {
    var n = 0, s = 0, ss = 0;
    for (var i = 0; i < a.length; i++) if (!sel || sel[i]) { n++; s += a[i]; ss += a[i] * a[i]; }
    return n > 1 ? (ss - s * s / n) / (n - 1) : NaN;
  }
  function corrSel(A, B, sel, ba, bb) {
    var n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (var i = 0; i < A.length; i++) {
      if (sel && !sel[i]) continue;
      var a = ba ? co(A[i], ba) : A[i], b = bb ? co(B[i], bb) : B[i];
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
    if (n < 3) return NaN;
    var va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    return va > 1e-12 && vb > 1e-12 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : NaN;
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sd(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (a.length - 1)); }
  function f2(x) { return isFinite(x) ? x.toFixed(2).replace(/^-0\.00$/, "0.00") : "—"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  // ============================================ 4. the two models
  // effective settings: artifacts that are switched off become neutral
  function effR(s, on) {
    var rr = on.rr ? (s.rr === "Direct" ? "direct" : "indirect") : "none";
    return {
      n: s.n, rho: s.rho,
      rxx: on.err ? s.rxx : 1, ryy: on.err ? s.ryy : 1, re: on.err ? s.re : 0,
      kx: on.coarse ? s.kx : 0, ky: on.coarse ? s.ky : 0,
      mode: rr, srx: s.srx, sry: s.sry, srz: s.srz, rz: s.rz, rzz: rr === "indirect" ? s.rzz : 1
    };
  }
  function effD(s, on) {
    return {
      n: s.n, delta: s.delta, pA: s.pA,
      ryy: on.err ? s.ryy : 1, pmis: on.mis ? s.pmis : 0, ky: on.coarse ? s.ky : 0,
      srz: on.sel ? s.srz : 1, ryz: s.ryz, rzz: on.sel ? s.rzz : 1
    };
  }
  function eff(key, s, on) { return key === "r" ? effR(s, on || s.on) : effD(s, on || s.on); }
  function selActiveR(e) { return (e.mode === "direct" && (e.srx < 1 || e.sry < 1)) || (e.mode === "indirect" && e.srz < 1); }

  // Correlation: true scores (Tx, Ty) with correlation rho; Z (indirect only)
  // correlates rz with both. Observed = sqrt(rel) * true + sqrt(1 - rel) * error,
  // and the X and Y errors correlate re (e.g., shared method variance).
  // Selection uses the continuous observed scores; coarsening happens last.
  function simR(e, g, n, keep) {
    var rho = e.rho, ind = e.mode === "indirect", a = ind ? e.rz : 0, i;
    var s1 = Math.sqrt(1 - rho * rho), c = s1 > 0 ? (1 - rho) * a / s1 : 0, dz = Math.sqrt(Math.max(0, 1 - a * a - c * c));
    var qx = Math.sqrt(e.rxx), ux = Math.sqrt(1 - e.rxx), qy = Math.sqrt(e.ryy), uy = Math.sqrt(1 - e.ryy);
    var qz = Math.sqrt(e.rzz), uz = Math.sqrt(1 - e.rzz), se = Math.sqrt(1 - e.re * e.re);
    var X = new Float64Array(n), Y = new Float64Array(n), Z = ind ? new Float64Array(n) : null;
    for (i = 0; i < n; i++) {
      var t1 = g.g1[i], t2 = g.g2[i];
      X[i] = qx * t1 + ux * g.ex[i];
      Y[i] = qy * (rho * t1 + s1 * t2) + uy * (e.re * g.ex[i] + se * g.ey[i]);
      if (ind) Z[i] = qz * (a * t1 + c * t2 + dz * g.g3[i]) + uz * g.ez[i];
    }
    var sel = new Uint8Array(n);
    if (e.mode === "direct") {
      var cx = cut(X, e.srx), cy = cut(Y, e.sry);
      for (i = 0; i < n; i++) sel[i] = X[i] >= cx && Y[i] >= cy ? 1 : 0;
    } else if (ind) {
      var cz = cut(Z, e.srz);
      for (i = 0; i < n; i++) sel[i] = Z[i] >= cz ? 1 : 0;
    } else sel.fill(1);
    var bx = bins(e.kx), by = bins(e.ky), nSel = 0;
    for (i = 0; i < n; i++) nSel += sel[i];
    var r = corrSel(X, Y, sel, bx, by);
    var out = { obs: r, cor: correctR(e, r, X, Y, Z, sel), nSel: nSel, n: n };
    if (keep) { out.X = X; out.Y = Y; out.sel = sel; out.bx = bx; out.by = by; }
    return out;
  }

  // Mean difference: group B's true mean is delta higher (within-group SD 1).
  // Y = sqrt(ryy) * true Y + error; group labels flip with probability pmis;
  // selection keeps the top srz share on Z, which correlates ryz with true Y.
  function simD(e, g, n, keep) {
    var pA = e.pA, dl = e.delta, mu = dl * (1 - pA), sdT = Math.sqrt(1 + dl * dl * pA * (1 - pA));
    var qy = Math.sqrt(e.ryy), uy = Math.sqrt(1 - e.ryy), qz = Math.sqrt(e.rzz), uz = Math.sqrt(1 - e.rzz);
    var a = e.ryz, sa = Math.sqrt(1 - a * a), i;
    var Y = new Float64Array(n), Z = new Float64Array(n), tB = new Uint8Array(n), oB = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      tB[i] = g.u[i] >= pA ? 1 : 0;
      oB[i] = g.um[i] < e.pmis ? 1 - tB[i] : tB[i];
      var yt = (tB[i] ? dl : 0) + g.ey[i];
      Y[i] = qy * yt + uy * g.em[i];
      Z[i] = qz * (a * (yt - mu) / sdT + sa * g.ez[i]) + uz * g.ezm[i];
    }
    var sel = new Uint8Array(n);
    if (e.srz < 1) { var cz = cut(Z, e.srz); for (i = 0; i < n; i++) sel[i] = Z[i] >= cz ? 1 : 0; }
    else sel.fill(1);
    var by = bins(e.ky), nA = 0, nB = 0, sA = 0, sB = 0, qA = 0, qB = 0;
    for (i = 0; i < n; i++) {
      if (!sel[i]) continue;
      var y = by ? co(Y[i], by) : Y[i];
      if (oB[i]) { nB++; sB += y; qB += y * y; } else { nA++; sA += y; qA += y * y; }
    }
    var d = NaN;
    if (nA > 1 && nB > 1) {
      var mA = sA / nA, mB = sB / nB;
      var pooled = ((qA - nA * mA * mA) + (qB - nB * mB * mB)) / (nA + nB - 2);
      d = pooled > 1e-12 ? (mB - mA) / Math.sqrt(pooled) : NaN;
    }
    var out = { obs: d, cor: correctD(e, d, nA, nB, Y, Z, oB, sel), nSel: nA + nB, n: n };
    if (keep) { out.Y = Y; out.sel = sel; out.tB = tB; out.oB = oB; out.by = by; }
    return out;
  }
  function sim(key, e, g, n, keep) { return key === "r" ? simR(e, g, n, keep) : simD(e, g, n, keep); }

  // ===================================================== 5. corrections
  // Textbook (Hunter–Schmidt style) corrections applied to the observed
  // estimate in reverse order of the artifacts, using the known reliabilities
  // and the sample's own SD ratios, as an analyst would.
  function caseII(r, u) { return r * u / Math.sqrt(1 - r * r + r * r * u * u); }          // u = SD ratio (new / old)
  function caseIII(r, rxz, ryz, v) {                                                      // v = Var(Z) ratio (new / old)
    var k = 1 - v;
    return (r - rxz * ryz * k) / Math.sqrt((1 - rxz * rxz * k) * (1 - ryz * ryz * k));
  }
  function phiMis(pA, m) { // correlation between true and observed group labels
    var pB = 1 - pA, qB = pB * (1 - m) + pA * m, qA = 1 - qB;
    return (pB * (1 - m) - pB * qB) / Math.sqrt(pA * pB * qA * qB);
  }
  function correctR(e, r, X, Y, Z, sel) {
    if (!isFinite(r)) return NaN;
    var rc = r / (cf(e.kx) * cf(e.ky));
    if (e.mode === "direct") {
      if (e.srx < 1) rc = caseII(rc, Math.sqrt(varOf(X, null) / varOf(X, sel)));
      if (e.sry < 1) rc = caseII(rc, Math.sqrt(varOf(Y, null) / varOf(Y, sel)));
    } else if (e.mode === "indirect" && e.srz < 1) {
      rc = caseIII(rc, corrSel(X, Z, sel), corrSel(Y, Z, sel), varOf(Z, null) / varOf(Z, sel));
    }
    // remove the shared error covariance, then disattenuate
    rc = (rc - e.re * Math.sqrt((1 - e.rxx) * (1 - e.ryy))) / Math.sqrt(e.rxx * e.ryy);
    return isFinite(rc) ? rc : NaN;
  }
  function correctD(e, d, nA, nB, Y, Z, oB, sel) {
    if (!isFinite(d)) return NaN;
    var p = nB / (nA + nB), r = d / Math.sqrt(d * d + 1 / (p * (1 - p)));   // d -> point-biserial r
    r /= cf(e.ky);
    if (e.srz < 1) {
      var G = Float64Array.from(oB);
      r = caseIII(r, corrSel(G, Z, sel), corrSel(Y, Z, sel), varOf(Z, null) / varOf(Z, sel));
    }
    r /= Math.sqrt(e.ryy);
    r /= phiMis(e.pA, e.pmis);
    if (!(Math.abs(r) < 1)) return NaN;
    var dc = r / Math.sqrt((1 - r * r) * e.pA * (1 - e.pA));             // back to d with the true group split
    return isFinite(dc) ? dc : NaN;
  }

  // ========================================== 6. theory (closed forms)
  // Correlation after selecting X >= cx and Y >= cy from a standard bivariate
  // normal with correlation r (midpoint-rule integration).
  function biTrunc(r, cx, cy) {
    var N = 220, hi = 7, hx = (hi - cx) / N, hy = (hi - cy) / N, k = 1 / (2 * (1 - r * r));
    var s0 = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < N; i++) {
      var x = cx + (i + 0.5) * hx;
      for (var j = 0; j < N; j++) {
        var y = cy + (j + 0.5) * hy, f = Math.exp(-(x * x - 2 * r * x * y + y * y) * k);
        s0 += f; sx += f * x; sy += f * y; sxx += f * x * x; syy += f * y * y; sxy += f * x * y;
      }
    }
    var mx = sx / s0, my = sy / s0;
    return (sxy / s0 - mx * my) / Math.sqrt((sxx / s0 - mx * mx) * (syy / s0 - my * my));
  }
  function formulaRR(e, r1) {
    if (e.mode === "direct") {
      if (e.srx < 1 && e.sry < 1) return { v: biTrunc(r1, qnorm(1 - e.srx), qnorm(1 - e.sry)), m: "truncated bivariate normal (numerical)" };
      if (e.srx < 1) return { v: caseII(r1, Math.sqrt(truncVar(e.srx))), m: "Thorndike Case II on X" };
      if (e.sry < 1) return { v: caseII(r1, Math.sqrt(truncVar(e.sry))), m: "Thorndike Case II on Y" };
      return { v: r1, m: "selection ratios are 1" };
    }
    if (e.srz >= 1) return { v: r1, m: "selection ratio is 1" };
    var rxz = e.rz * Math.sqrt(e.rxx * e.rzz), ryz = e.rz * Math.sqrt(e.ryy * e.rzz);
    return { v: caseIII(r1, rxz, ryz, truncVar(e.srz)), m: "Thorndike Case III (Pearson–Lawley)" };
  }
  // Exact population d for measurement error, misclassification, and selection
  // on Z (within each true group Y and Z are bivariate normal), or for
  // coarseness without selection (binned normal mixtures).
  function dAnalytic(e) {
    var pA = e.pA, pB = 1 - pA, m = e.pmis, dl = e.delta, qy = Math.sqrt(e.ryy);
    var mu = dl * pB, sdT = Math.sqrt(1 + dl * dl * pA * pB), rzz = e.rzz, a = e.ryz;
    var tg = [{ p: pA, mt: 0 }, { p: pB, mt: dl }];
    var sel = e.srz < 1, by = bins(e.ky);
    var sz = Math.sqrt(rzz * (a * a / (sdT * sdT) + 1 - a * a) + 1 - rzz);
    var cov = qy * Math.sqrt(rzz) * a / sdT;
    tg.forEach(function (g) { g.mz = Math.sqrt(rzz) * a * (g.mt - mu) / sdT; g.my = qy * g.mt; });
    var c = -Infinity;
    if (sel) { // Z cutoff that keeps the top srz share of the whole population
      var lo = -12, hi = 12;
      for (var it = 0; it < 80; it++) {
        var mid = (lo + hi) / 2, keep = 0;
        tg.forEach(function (g) { keep += g.p * (1 - normCdf((mid - g.mz) / sz)); });
        if (keep > e.srz) lo = mid; else hi = mid;
      }
      c = (lo + hi) / 2;
    }
    tg.forEach(function (g) {
      if (sel) {
        var al = (c - g.mz) / sz, P = 1 - normCdf(al), l = normPdf(al) / P, b = cov / (sz * sz);
        g.P = P; g.m1 = g.my + b * sz * l;
        var v = b * b * sz * sz * (1 + al * l - l * l) + (1 - b * b * sz * sz);
        g.m2 = v + g.m1 * g.m1;
      } else if (by) {
        var mo = binMoments(g.my, by); g.P = 1; g.m1 = mo[0]; g.m2 = mo[1];
      } else { g.P = 1; g.m1 = g.my; g.m2 = 1 + g.my * g.my; }
    });
    // observed group A holds true A kept (1 - m) and true B flipped (m); B the reverse
    function obs(wA, wB) {
      var M = wA * tg[0].P + wB * tg[1].P;
      var m1 = (wA * tg[0].P * tg[0].m1 + wB * tg[1].P * tg[1].m1) / M;
      var m2 = (wA * tg[0].P * tg[0].m2 + wB * tg[1].P * tg[1].m2) / M;
      return { M: M, mean: m1, v: m2 - m1 * m1 };
    }
    var A = obs(pA * (1 - m), pB * m), B = obs(pA * m, pB * (1 - m));
    return (B.mean - A.mean) / Math.sqrt((A.M * A.v + B.M * B.v) / (A.M + B.M));
  }

  // Attenuation budget: add the artifacts one at a time, in the order the
  // data are generated. "pop" = the value in a 60,000-case population.
  function steps(key) {
    var s = state[key], on = {}, out = [];
    if (key === "r") {
      out.push({ label: "True correlation", e: effR(s, on), f: s.rho, m: "", truth: true });
      var r1 = s.rho;
      if (s.on.err) {
        on.err = 1; var e1 = effR(s, on); r1 = s.rho * Math.sqrt(e1.rxx * e1.ryy) + e1.re * Math.sqrt((1 - e1.rxx) * (1 - e1.ryy));
        out.push({ label: "+ Measurement error", e: e1, f: r1, m: "ρ√(rXX·rYY)" });
      }
      var fr = r1;
      if (s.on.rr) {
        on.rr = 1; var e2 = effR(s, on), f = formulaRR(e2, r1); fr = f.v;
        out.push({ label: "+ Range restriction (" + (e2.mode === "direct" ? "direct" : "indirect") + ")", e: e2, f: f.v, m: f.m });
      }
      if (s.on.coarse) {
        on.coarse = 1; var e3 = effR(s, on), both = e3.kx > 0 && e3.ky > 0, act = selActiveR(e3);
        out.push({ label: "+ Coarseness", e: e3, f: act ? NaN : fr * cf(e3.kx) * cf(e3.ky),
          m: act ? "no closed form after selection" : (both ? "≈ r·cX·cY (both variables cut)" : "r·c (exact when one variable is cut)"), approx: both && !act });
      }
    } else {
      out.push({ label: "True mean difference", e: effD(s, on), f: s.delta, m: "", truth: true });
      var names = { err: "+ Measurement error", mis: "+ Misclassification", sel: "+ Range restriction (on Z)", coarse: "+ Coarseness" };
      var meth = { err: "δ√rYY", mis: "mixture of true groups (exact)", sel: "truncated normal within groups (exact)", coarse: "binned normal mixture (exact)" };
      ["err", "mis", "sel", "coarse"].forEach(function (t) {
        if (!s.on[t]) return;
        on[t] = 1;
        var e = effD(s, on), noForm = e.srz < 1 && e.ky > 0;
        out.push({ label: names[t], e: e, f: noForm ? NaN : dAnalytic(e), m: noForm ? "no closed form after selection" : meth[t] });
      });
    }
    return out;
  }
  var budget = { r: null, d: null };
  function computeBudget(key) {
    var P = population()[key], st = steps(key), sig = sigOf(key, true);
    // exact closed form where one exists, otherwise the simulated population
    st.forEach(function (x, i) { x.pop = i === 0 || (isFinite(x.f) && !x.approx) ? x.f : sim(key, x.e, P, NP).obs; });
    budget[key] = { sig: sig, steps: st, expected: st[st.length - 1].pop };
  }

  // ====================================================== 7. rendering
  var el = {
    stats: app.querySelector(".as-stats"), svg: app.querySelector(".as-plot"),
    legend: app.querySelector(".as-legend"), budget: app.querySelector(".as-budget")
  };
  var svg = el.svg;
  var layer = {};
  ["axes", "under", "out", "in", "over"].forEach(function (k) { var g = document.createElementNS(NS, "g"); svg.appendChild(g); layer[k] = g; });
  var W = 640, H = 480, M = { l: 54, r: 14, t: 14, b: 50 };
  function sizePlot() {
    var w = Math.round(Math.max(300, Math.min(760, svg.parentNode.clientWidth || 640)));
    W = w; H = Math.round(w < 520 ? w * 0.92 : w * 0.72);
    M = { l: w < 520 ? 44 : 54, r: 12, t: 14, b: 48 };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  }
  function scale(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function axes(sx, sy, xT, yT, xTitle, yTitle, xLab) {
    var h = "";
    yT.forEach(function (t) {
      h += '<line class="as-grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/>';
      h += '<text x="' + (M.l - 8) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + t + "</text>";
    });
    xT.forEach(function (t, i) {
      if (!xLab) h += '<line class="as-grid" y1="' + M.t + '" y2="' + (H - M.b) + '" x1="' + sx(t) + '" x2="' + sx(t) + '"/>';
      h += '<text x="' + sx(t) + '" y="' + (H - M.b + 19) + '" text-anchor="middle">' + (xLab ? xLab[i] : t) + "</text>";
    });
    h += '<rect class="as-frame" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t - M.b) + '"/>';
    h += '<text class="as-axis-title" x="' + ((M.l + W - M.r) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + xTitle + "</text>";
    h += '<text class="as-axis-title" transform="translate(15,' + ((M.t + H - M.b) / 2) + ') rotate(-90)" text-anchor="middle">' + yTitle + "</text>";
    return h;
  }
  function circleD(r) { return "M" + (-r) + ",0a" + r + "," + r + " 0 1,0 " + 2 * r + ",0a" + r + "," + r + " 0 1,0 " + (-2 * r) + ",0"; }
  function triD(s) { return "M0," + (-s) + "L" + s + "," + (0.8 * s) + "L" + (-s) + "," + (0.8 * s) + "Z"; }
  function hash(i, k) { var v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); }
  function mark(d, cls) { return '<path class="' + cls + '" d="' + d + '"/>'; }

  // point pool, so points can glide to new positions
  var pool = [], anim = null;
  function placePoints(pts, animate) {
    var i, p;
    while (pool.length < pts.length) {
      var node = document.createElementNS(NS, "path");
      pool.push({ node: node, x: NaN, y: NaN, d: "", cls: "" });
    }
    for (i = 0; i < pool.length; i++) {
      p = pool[i];
      if (i >= pts.length) { if (p.node.parentNode) p.node.parentNode.removeChild(p.node); p.x = p.y = NaN; continue; }
      var t = pts[i], g = t.in ? layer["in"] : layer.out;
      if (p.node.parentNode !== g) g.appendChild(p.node);
      if (p.d !== t.d) { p.node.setAttribute("d", t.d); p.d = t.d; }
      if (p.cls !== t.cls) { p.node.setAttribute("class", t.cls); p.cls = t.cls; }
      p.fx = isFinite(p.x) ? p.x : t.x; p.fy = isFinite(p.y) ? p.y : t.y; p.tx = t.x; p.ty = t.y;
    }
    if (anim) cancelAnimationFrame(anim);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function set(k) {
      for (var j = 0; j < pts.length; j++) {
        var q = pool[j];
        q.x = q.fx + (q.tx - q.fx) * k; q.y = q.fy + (q.ty - q.fy) * k;
        q.node.setAttribute("transform", "translate(" + q.x.toFixed(1) + "," + q.y.toFixed(1) + ")");
      }
    }
    if (!animate || reduce) { set(1); return; }
    var t0 = performance.now(), dur = 420;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      set(1 - Math.pow(1 - k, 3));
      if (k < 1) anim = requestAnimationFrame(step); else anim = null;
    })(t0);
  }
  function clearPoints() { placePoints([], false); }

  function tiles(list) {
    el.stats.innerHTML = list.map(function (t) {
      return '<div class="as-stat"><div class="as-key">' + t[0] + '</div><div class="as-stat-val' + (t[2] ? " " + t[2] : "") + '">' + t[1] + "</div></div>";
    }).join("");
  }
  function legend(list) {
    el.legend.innerHTML = list.map(function (t) {
      return '<span><svg viewBox="-7 -7 14 14" class="as-plot" aria-hidden="true">' + t[0] + "</svg>" + t[1] + "</span>";
    }).join("");
  }
  function expectedTile(key) {
    var b = budget[key];
    if (!b) return ["Expected " + key, "…", "is-stale"];
    return ["Expected " + key, f2(b.expected), b.sig === sigOf(key, true) ? "" : "is-stale"];
  }

  var last = null;  // last rendered summary, used in exported images
  function renderSampleR(animate) {
    var s = state.r, e = eff("r", s), n = e.n, res = simR(e, SAMPLE.r, n, true);
    tiles([["Observed r", f2(res.obs), "as-lead"], ["Corrected r", f2(res.cor)], expectedTile("r"), ["True r", f2(s.rho)], ["n selected", res.nSel + " / " + n]]);
    last = "Observed r = " + f2(res.obs) + " · Corrected = " + f2(res.cor) + " · True = " + f2(s.rho);
    var L = 4, sx = scale(-L, L, M.l, W - M.r), sy = scale(-L, L, H - M.b, M.t), T = [-3, -2, -1, 0, 1, 2, 3];
    var cl = function (v) { return Math.max(-L + 0.06, Math.min(L - 0.06, v)); };
    layer.axes.innerHTML = axes(sx, sy, T, T, "X observed", "Y observed");
    layer.under.innerHTML = "";
    var rad = n > 500 ? 2.7 : 3.3, pts = [], xs = [], ys = [];
    for (var i = 0; i < n; i++) {
      var x = res.bx ? co(res.X[i], res.bx) : res.X[i], y = res.by ? co(res.Y[i], res.by) : res.Y[i], on = !!res.sel[i];
      // binned scores are jittered on screen only, so stacked points stay visible
      var jx = res.bx ? (hash(i, 1) - 0.5) * res.bx.w * 0.55 : 0, jy = res.by ? (hash(i, 2) - 0.5) * res.by.w * 0.55 : 0;
      pts.push({ x: sx(cl(x + jx)), y: sy(cl(y + jy)), d: circleD(rad), cls: on ? "as-pt-in" : "as-pt-out", in: on });
      if (on) { xs.push(x); ys.push(y); }
    }
    placePoints(pts, animate);
    var over = "";
    if (s.fit === "Yes" && isFinite(res.obs) && xs.length > 2) {
      var mx = mean(xs), my = mean(ys), b = res.obs * sd(ys) / sd(xs);
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      over = '<line class="as-fit" x1="' + sx(cl(x0)) + '" x2="' + sx(cl(x1)) + '" y1="' + sy(cl(my + b * (x0 - mx))) + '" y2="' + sy(cl(my + b * (x1 - mx))) + '"/>';
    }
    layer.over.innerHTML = over;
    var lg = [[mark(circleD(3.6), "as-pt-in"), "Selected"], [mark(circleD(3.6), "as-pt-out"), "Not selected"]];
    if (over) lg.push(['<line class="as-fit" x1="-7" x2="7" y1="0" y2="0"/>', "Regression line (selected)"]);
    legend(lg);
  }
  function renderSampleD(animate) {
    var s = state.d, e = eff("d", s), n = e.n, g = SAMPLE.d, res = simD(e, g, n, true), i;
    tiles([["Observed d", f2(res.obs), "as-lead"], ["Corrected d", f2(res.cor)], expectedTile("d"), ["True d", f2(s.delta)], ["n selected", res.nSel + " / " + n]]);
    last = "Observed d = " + f2(res.obs) + " · Corrected = " + f2(res.cor) + " · True = " + f2(s.delta);
    var lo = -4, hi = Math.max(4, Math.ceil(s.delta + 3.5));
    var sy = scale(lo, hi, H - M.b, M.t), iw = W - M.l - M.r, px = { A: M.l + iw * 0.28, B: M.l + iw * 0.72 };
    var yT = []; for (var t = lo; t <= hi; t += 2) yT.push(t);
    layer.axes.innerHTML = axes(function (k) { return px[k]; }, sy, ["A", "B"], yT, "Observed group", "Y observed", ["A", "B"]);
    layer.under.innerHTML = '<line class="as-zero" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + sy(0) + '" y2="' + sy(0) + '"/>';
    var off = iw * 0.1, band = iw * 0.12, ptX = { A: px.A - off, B: px.B + off }, boxX = { A: px.A + off, B: px.B - off };
    var rad = n > 500 ? 2.7 : 3.3, pts = [], grp = { A: [], B: [] };
    for (i = 0; i < n; i++) {
      var k = res.oB[i] ? "B" : "A", y = res.by ? co(res.Y[i], res.by) : res.Y[i], on = !!res.sel[i];
      var jy = res.by ? (hash(i, 2) - 0.5) * res.by.w * 0.55 : 0;
      pts.push({ x: ptX[k] + (g.jit[i] - 0.5) * band, y: sy(Math.max(lo + 0.06, Math.min(hi - 0.06, y + jy))),
        d: res.tB[i] ? triD(rad + 1) : circleD(rad), cls: on ? "as-pt-in" : "as-pt-out", in: on });
      if (on) grp[k].push(y);
    }
    placePoints(pts, animate);
    var h = "", bw = Math.max(18, iw * 0.05);
    ["A", "B"].forEach(function (k) {
      var v = grp[k].slice().sort(function (a, b) { return a - b; });
      if (v.length < 2) return;
      var q = function (p) { var hh = (v.length - 1) * p, l = Math.floor(hh); return v[l] + (hh - l) * ((v[l + 1] === undefined ? v[l] : v[l + 1]) - v[l]); };
      var q1 = q(0.25), md = q(0.5), q3 = q(0.75), iqr = q3 - q1;
      var wl = v.filter(function (x) { return x >= q1 - 1.5 * iqr; })[0], wh = v.filter(function (x) { return x <= q3 + 1.5 * iqr; }).pop();
      var x = boxX[k];
      h += '<line class="as-box-line" x1="' + x + '" x2="' + x + '" y1="' + sy(wl) + '" y2="' + sy(q1) + '"/>';
      h += '<line class="as-box-line" x1="' + x + '" x2="' + x + '" y1="' + sy(q3) + '" y2="' + sy(wh) + '"/>';
      h += '<rect class="as-box" x="' + (x - bw / 2) + '" y="' + sy(q3) + '" width="' + bw + '" height="' + Math.max(1, sy(q1) - sy(q3)) + '"/>';
      h += '<line class="as-box-med" x1="' + (x - bw / 2) + '" x2="' + (x + bw / 2) + '" y1="' + sy(md) + '" y2="' + sy(md) + '"/>';
    });
    layer.over.innerHTML = h;
    legend([[mark(circleD(3.6), "as-pt-in"), "True group A"], [mark(triD(4.4), "as-pt-in"), "True group B"],
      [mark(circleD(3.6), "as-pt-out"), "Not selected"], ['<rect class="as-box" x="-6" y="-6" width="12" height="12"/>', "Box plot (selected)"]]);
  }

  // ---- replications
  var REPS = 1000, repl = { r: null, d: null }, replToken = 0, replTimer = null, running = null;
  function runRepl(key) {
    var token = ++replToken, s = state[key], e = eff(key, s), n = e.n, sig = sigOf(key, false);
    running = sig;
    var rng = mulberry32((seed ^ 0x5bd1e995) >>> 0), g = makeDraws(key, n), obs = [], cor = [];
    (function chunk() {
      if (token !== replToken) return;
      for (var k = 0; k < 50 && obs.length < REPS; k++) {
        var res = sim(key, e, fillDraws(key, g, rng, n), n);
        obs.push(res.obs); cor.push(res.cor);
      }
      if (obs.length < REPS) {
        if (tab === key && view === "repl") status("Running " + obs.length + " / " + REPS + " replications…");
        setTimeout(chunk, 0);
      } else {
        running = null;
        repl[key] = { sig: sig, obs: obs, cor: cor };
        if (tab === key && view === "repl") { renderRepl(); renderBudget(); }
      }
    })();
  }
  function status(msg) {
    layer.over.innerHTML = '<text class="as-status" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">' + esc(msg) + "</text>";
  }
  function renderRepl() {
    var key = tab, s = state[key], truth = key === "r" ? s.rho : s.delta, R = repl[key], sym = key;
    clearPoints();
    layer.under.innerHTML = "";
    var fresh = R && R.sig === sigOf(key, false);
    if (!fresh) {
      layer.axes.innerHTML = "";
      status("Running " + REPS + " replications…");
      tiles([["Mean observed " + sym, "…", "is-stale"], ["SD observed", "…", "is-stale"], ["Mean corrected", "…", "is-stale"], ["SD corrected", "…", "is-stale"], ["True " + sym, f2(truth)]]);
      if (running !== sigOf(key, false)) {
        clearTimeout(replTimer);
        replTimer = setTimeout(function () { runRepl(key); }, 150);
      }
      return;
    }
    var ob = R.obs.filter(isFinite), cr = R.cor.filter(function (v) { return isFinite(v) && (key === "d" || Math.abs(v) <= 1); });
    var dropped = R.cor.length - cr.length;
    tiles([["Mean observed " + sym, f2(mean(ob)), "as-lead"], ["SD observed", f2(sd(ob))], ["Mean corrected", f2(mean(cr))], ["SD corrected", f2(sd(cr))], ["True " + sym, f2(truth)]]);
    last = REPS + " replications, n = " + s.n + " · mean observed = " + f2(mean(ob)) + " · mean corrected = " + f2(mean(cr)) + " · true = " + f2(truth);
    var all = ob.concat(cr, [truth]), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (budget[key] && isFinite(budget[key].expected)) { lo = Math.min(lo, budget[key].expected); hi = Math.max(hi, budget[key].expected); }
    var pad = (hi - lo) * 0.06 || 0.1; lo -= pad; hi += pad;
    if (key === "r") { lo = Math.max(-1, lo); hi = Math.min(1, hi); }
    var nb = W < 520 ? 30 : 44, bw = (hi - lo) / nb;
    function hist(v) { var h = new Array(nb).fill(0); v.forEach(function (x) { var i = Math.floor((x - lo) / bw); if (i >= 0 && i < nb) h[i]++; }); return h; }
    var hO = hist(ob), hC = hist(cr), top = Math.max(Math.max.apply(null, hO), Math.max.apply(null, hC));
    var yMax = Math.ceil(top * 1.12 / 10) * 10 || 10;
    var sx = scale(lo, hi, M.l, W - M.r), sy = scale(0, yMax, H - M.b, M.t);
    var step = niceStep(hi - lo), xT = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) xT.push(+t.toFixed(2));
    var yStep = niceStep(yMax), yT = [];
    for (var u = 0; u <= yMax + 1e-9; u += yStep) yT.push(Math.round(u));
    layer.axes.innerHTML = axes(sx, sy, xT, yT, (key === "r" ? "Correlation" : "Standardized mean difference") + " across " + REPS + " samples", "Count");
    var h = "", i;
    for (i = 0; i < nb; i++) if (hO[i]) h += '<rect class="as-hist-obs" x="' + (sx(lo + i * bw) + 0.5) + '" y="' + sy(hO[i]) + '" width="' + Math.max(0.5, sx(lo + bw) - sx(lo) - 1) + '" height="' + (sy(0) - sy(hO[i])) + '"/>';
    var pth = "M" + sx(lo) + "," + sy(0);
    for (i = 0; i < nb; i++) pth += "L" + sx(lo + i * bw) + "," + sy(hC[i]) + "L" + sx(lo + (i + 1) * bw) + "," + sy(hC[i]);
    pth += "L" + sx(hi) + "," + sy(0);
    h += '<path class="as-hist-cor" d="' + pth + '"/>';
    function vline(v, cls, label, dy) {
      if (!isFinite(v) || v < lo || v > hi) return "";
      var x = sx(v), right = x > W * 0.7;
      return '<line class="' + cls + '" x1="' + x + '" x2="' + x + '" y1="' + M.t + '" y2="' + (H - M.b) + '"/>' +
        '<text class="as-vl-label" x="' + (x + (right ? -6 : 6)) + '" y="' + (M.t + 16 + dy) + '" text-anchor="' + (right ? "end" : "start") + '">' + label + "</text>";
    }
    h += vline(truth, "as-vl-true", "True " + f2(truth), 0);
    if (budget[key]) h += vline(budget[key].expected, "as-vl-exp", "Expected " + f2(budget[key].expected), 18);
    layer.over.innerHTML = h;
    var lg = [['<rect class="as-hist-obs" x="-7" y="-7" width="14" height="14"/>', "Observed"],
      ['<path class="as-hist-cor" d="M-7,6L-7,-4L0,-4L0,1L7,1L7,6"/>', "Corrected"],
      ['<line class="as-vl-true" x1="0" x2="0" y1="-7" y2="7"/>', "True value"],
      ['<line class="as-vl-exp" x1="0" x2="0" y1="-7" y2="7"/>', "Expected (population)"]];
    if (dropped) lg.push(["", dropped + " corrected values fell outside the valid range and are not shown"]);
    legend(lg);
  }
  function niceStep(span) {
    var raw = span / 6, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  // ---- bias breakdown table
  function renderBudget() {
    var key = tab, b = budget[key], sym = key === "r" ? "r" : "d";
    if (!b) { el.budget.innerHTML = ""; return; }
    var truth = b.steps[0].pop, rows = "", prev = truth;
    b.steps.forEach(function (st, i) {
      var w = truth > 0 && isFinite(st.pop) ? Math.max(0, Math.min(100, st.pop / truth * 100)) : 0;
      var ch = i === 0 ? "" : (isFinite(st.pop) && isFinite(prev) ? (st.pop - prev >= 0 ? "+" : "−") + Math.abs(st.pop - prev).toFixed(2) : "—");
      rows += "<tr><td>" + esc(st.label) + '<div class="as-bar"><i style="width:' + w.toFixed(1) + '%"></i></div></td>' +
        '<td class="as-num">' + f2(st.pop) + '</td><td class="as-num as-loss">' + ch + "</td></tr>";
      prev = st.pop;
    });
    var total = b.expected;
    el.budget.className = "as-budget" + (b.sig === sigOf(key, true) ? "" : " is-stale");
    el.budget.innerHTML = '<div class="as-key">Bias breakdown</div><table><thead><tr><th class="as-key">Step</th><th class="as-key as-num">Expected ' + sym +
      '</th><th class="as-key as-num">Change</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td>' + (total > truth ? "Total inflation" : "Total attenuation") + '</td><td class="as-num">' + f2(total) + '</td><td class="as-num as-loss">' +
      (isFinite(total) ? (total - truth >= 0 ? "+" : "−") + Math.abs(total - truth).toFixed(2) : "—") + "</td></tr></tfoot></table>" +
      '<p class="as-note">Artifacts are added one at a time in the order the data are generated. <em>Expected</em> is what a very large study would find: exact where a formula exists, otherwise simulated from ' + NP.toLocaleString() +
      " cases. Switch an artifact off in the controls to remove it from the breakdown.</p>";
  }

  function render(animate) {
    sizePlot();
    if (view === "repl") renderRepl();
    else if (tab === "r") renderSampleR(animate); else renderSampleD(animate);
    renderBudget();
  }

  // ======================================= 8. export, URL state, wiring
  function styled(clone) {
    var src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
    var props = ["fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight"];
    for (var i = 0; i < src.length; i++) {
      var cs = getComputedStyle(src[i]), st = "";
      props.forEach(function (p) { st += p + ":" + cs.getPropertyValue(p) + ";"; });
      dst[i].setAttribute("style", st);
      dst[i].removeAttribute("class");
    }
    return clone;
  }
  function exportSvg() {
    var head = 34, clone = styled(svg.cloneNode(true)), bs = getComputedStyle(document.body);
    clone.setAttribute("xmlns", NS);
    clone.setAttribute("viewBox", "0 " + (-head) + " " + W + " " + (H + head));
    clone.setAttribute("width", W); clone.setAttribute("height", H + head);
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", -head); bg.setAttribute("width", W); bg.setAttribute("height", H + head);
    bg.setAttribute("fill", bs.backgroundColor);
    clone.insertBefore(bg, clone.firstChild);
    var tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", M.l); tx.setAttribute("y", -12);
    tx.setAttribute("style", "font-family:Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;fill:" + bs.color);
    tx.textContent = last || "";
    clone.appendChild(tx);
    return new XMLSerializer().serializeToString(clone);
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fileName(ext) { return "artifact-simulator-" + (tab === "r" ? "correlation" : "smd") + "-" + (view === "repl" ? "replications" : "sample") + "." + ext; }
  function downloadSvg() { download(new Blob([exportSvg()], { type: "image/svg+xml" }), fileName("svg")); }
  function downloadPng() {
    var img = new Image(), url = URL.createObjectURL(new Blob([exportSvg()], { type: "image/svg+xml" }));
    img.onload = function () {
      var c = document.createElement("canvas"), k = 2;
      c.width = W * k; c.height = (H + 34) * k;
      var ctx = c.getContext("2d"); ctx.scale(k, k); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { download(b, fileName("png")); }, "image/png");
    };
    img.src = url;
  }

  // URL hash: only values that differ from the defaults
  function sigOf(key, forBudget) {
    var s = state[key], o = {};
    items(key).forEach(function (c) { if (c.id !== "fit") o[c.id] = s[c.id]; });
    if (forBudget) delete o.n;
    o.on = s.on;
    return JSON.stringify(o) + (forBudget ? "" : "|" + seed);
  }
  function writeHash() {
    if (!active) return;
    var parts = ["t=" + tab];
    if (view !== "sample") parts.push("v=" + view);
    parts.push("s=" + seed);
    ["r", "d"].forEach(function (key) {
      var dft = defaults(key), s = state[key];
      items(key).forEach(function (c) { if (s[c.id] !== dft[c.id]) parts.push(key + "." + c.id + "=" + s[c.id]); });
      TOGGLES[key].forEach(function (t) { if (!s.on[t]) parts.push(key + ".off." + t + "=1"); });
    });
    try { history.replaceState(null, "", "#" + parts.join("&")); } catch (e) { /* file:// or sandbox */ }
  }
  function readHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    h.split("&").forEach(function (kv) {
      var p = kv.split("="), k = decodeURIComponent(p[0] || ""), v = decodeURIComponent(p[1] || "");
      if (k === "t" && (v === "r" || v === "d")) tab = v;
      else if (k === "v" && (v === "repl" || v === "sample")) view = v;
      else if (k === "s" && /^\d+$/.test(v)) seed = Number(v) >>> 0;
      else {
        var m = k.match(/^([rd])\.(off\.)?(\w+)$/);
        if (!m) return;
        if (m[2]) { if (TOGGLES[m[1]].indexOf(m[3]) >= 0) state[m[1]].on[m[3]] = false; return; }
        var c = items(m[1]).filter(function (x) { return x.id === m[3]; })[0];
        if (!c) return;
        if (c.type === "radio") { if (c.options.indexOf(v) >= 0) state[m[1]][c.id] = v; }
        else { var num = Number(v); if (isFinite(num)) state[m[1]][c.id] = Math.min(c.max, Math.max(c.min, num)); }
      }
    });
  }

  // small "i" button with a pop-up description (opened on hover or tap; the
  // page script in artifact-simulator.qmd handles tapping and Escape)
  function infoTip(c, uid) {
    if (!c.info) return "";
    return '<button type="button" class="as-info" aria-label="About: ' + c.label + '" aria-describedby="' + uid + '-tip" aria-expanded="false">i</button>' +
      '<span class="as-tip" role="tooltip" id="' + uid + '-tip">' + c.info + "</span>";
  }
  function fmtVal(c, v) { return c.zero && Number(v) === 0 ? c.zero : Number(v).toFixed(c.dp === undefined ? 2 : c.dp); }
  function buildPanel(key) {
    var panel = app.querySelector('.as-panel[data-panel="' + key + '"]'), s = state[key];
    var ph = '<label class="as-preset"><span class="as-key">Scenario</span><select><option value="">Custom settings</option><option value="reset">Default settings</option>' +
      PRESETS[key].map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + "</option>"; }).join("") + "</select></label>";
    panel.insertAdjacentHTML("beforeend", ph);
    panel.querySelector("select").addEventListener("change", function (ev) {
      var v = ev.target.value;
      if (v === "") return;
      var fresh = defaults(key);
      if (v !== "reset") {
        var p = PRESETS[key][Number(v)];
        for (var k in p.set) fresh[k] = p.set[k];
        for (var t in p.on) fresh.on[t] = !!p.on[t];
      }
      fresh.n = state[key].n;
      state[key] = fresh;
      syncPanel(key);
      ev.target.value = v;
      changed(true);
    });
    GROUPS[key].forEach(function (grp) {
      var gd = document.createElement("div");
      gd.className = "as-group";
      var head = '<div class="as-group-head"><span class="as-key">' + grp.title + "</span>";
      if (grp.toggle) head += '<label class="as-switch"><span>' + (s.on[grp.toggle] ? "On" : "Off") + '</span><input type="checkbox" aria-label="' + grp.title + '"' + (s.on[grp.toggle] ? " checked" : "") + "></label>";
      gd.innerHTML = head + "</div>";
      if (grp.toggle) {
        gd.dataset.toggle = grp.toggle;
        gd.querySelector(".as-switch input").addEventListener("change", function (ev) {
          state[key].on[grp.toggle] = ev.target.checked;
          syncPanel(key); markCustom(key); changed(true);
        });
      }
      grp.items.forEach(function (c) {
        var f = document.createElement("div"), uid = "as-" + key + "-" + c.id;
        f.className = "as-field"; f.dataset.id = c.id;
        if (c.type === "radio") {
          var h = '<div class="as-field-head"><span class="as-lab"><span class="as-field-label" id="' + uid + '-l">' + c.label + "</span>" + infoTip(c, uid) + '</span></div><div class="as-seg" role="radiogroup" aria-labelledby="' + uid + '-l">';
          c.options.forEach(function (o) { h += '<label><input type="radio" name="' + uid + '" value="' + o + '"' + (o === s[c.id] ? " checked" : "") + ">" + o + "</label>"; });
          f.innerHTML = h + "</div>";
          f.addEventListener("change", function (ev) { state[key][c.id] = ev.target.value; syncPanel(key); markCustom(key); changed(true); });
        } else {
          f.innerHTML = '<div class="as-field-head"><span class="as-lab"><label for="' + uid + '">' + c.label + "</label>" + infoTip(c, uid) + '</span><span class="as-val">' + fmtVal(c, s[c.id]) + "</span></div>" +
            '<input type="range" id="' + uid + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + s[c.id] + '">';
          var out = f.querySelector(".as-val");
          f.querySelector("input").addEventListener("input", function (ev) {
            state[key][c.id] = Number(ev.target.value);
            out.textContent = fmtVal(c, ev.target.value);
            markCustom(key); changed(null);
          });
        }
        gd.appendChild(f);
      });
      panel.appendChild(gd);
    });
    syncPanel(key);
  }
  function markCustom(key) { app.querySelector('.as-panel[data-panel="' + key + '"] select').value = ""; }
  function syncPanel(key) {
    var panel = app.querySelector('.as-panel[data-panel="' + key + '"]'), s = state[key];
    items(key).forEach(function (c) {
      var f = panel.querySelector('.as-field[data-id="' + c.id + '"]');
      if (c.type === "radio") f.querySelectorAll("input").forEach(function (i) { i.checked = i.value === s[c.id]; });
      else { f.querySelector("input").value = s[c.id]; f.querySelector(".as-val").textContent = fmtVal(c, s[c.id]); }
      f.hidden = c.show ? !c.show(s) : false;
    });
    panel.querySelectorAll(".as-group[data-toggle]").forEach(function (g) {
      var on = !!s.on[g.dataset.toggle], cb = g.querySelector(".as-switch input");
      cb.checked = on; g.querySelector(".as-switch span").textContent = on ? "On" : "Off";
      g.classList.toggle("is-off", !on);
      g.querySelectorAll(".as-field input").forEach(function (i) { i.disabled = !on; });
    });
  }

  // change handling: draw the sample now, recompute the heavy parts shortly after
  var lastInput = 0, heavyTimer = null;
  function changed(animate) {
    var now = performance.now();
    if (animate === null) animate = now - lastInput > 160;   // a jump (click on the track) glides; a drag follows the thumb
    lastInput = now;
    render(animate);
    clearTimeout(heavyTimer);
    heavyTimer = setTimeout(function () {
      var key = tab;
      if (!budget[key] || budget[key].sig !== sigOf(key, true)) computeBudget(key);
      writeHash();
      render(false);
    }, 140);
  }

  // ---- wiring
  readHash();
  drawSample();
  buildPanel("r");
  buildPanel("d");
  function setTab(t) {
    tab = t;
    app.querySelectorAll(".as-tab").forEach(function (o) { o.setAttribute("aria-selected", o.dataset.tab === tab ? "true" : "false"); });
    app.querySelectorAll(".as-panel").forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
  }
  setTab(tab);
  // the page-level tab bar (artifact-simulator.qmd) announces tab changes
  document.addEventListener("sim:tab", function (ev) {
    var t = ev.detail;
    active = t === "r" || t === "d";
    if (!active) return;
    if (t !== tab) { setTab(t); clearPoints(); }
    changed(false);
  });
  app.querySelectorAll('.as-view input').forEach(function (i) {
    i.checked = i.value === view;
    i.addEventListener("change", function () { view = i.value; clearPoints(); changed(false); });
  });
  app.querySelector(".as-seed").addEventListener("click", function () {
    seed = Math.floor(Math.random() * 4294967295) >>> 0;
    drawSample();
    changed(true);
  });
  app.querySelector(".as-png").addEventListener("click", downloadPng);
  app.querySelector(".as-svg").addEventListener("click", downloadSvg);
  var copyBtn = app.querySelector(".as-copy");
  copyBtn.addEventListener("click", function () {
    writeHash();
    var url = location.href, done = function () { copyBtn.textContent = "Link copied"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
    function fallback() {
      var t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
      t.remove();
    }
  });
  var rt = null;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { render(false); }, 120); });
  computeBudget(tab);
  render(false);
})();
