/* Clinical Trial Simulator: artifacts in a two-arm pre-post-control
   randomized trial. No dependencies. Markup: trial-simulator.qmd (#tr-app).
   Styles: artifact-simulator/simulator.css (shared, plus .tr-* rules).
   Everything is simulated in true-score SD units and converted to points
   (mean difference) or standardized (SMD) for display. Sections:
     1. controls, presets      4. estimands and expected values
     2. the trial model        5. rendering (sample, replications, breakdown)
     3. analysis               6. export, URL state, wiring              */
(function () {
  "use strict";
  var app = document.getElementById("tr-app");
  if (!app) return;
  var NS = "http://www.w3.org/2000/svg";

  // ======================================================= 1. controls
  var ANALYSIS = [
    { id: "metric", label: "Effect size", type: "radio", options: [["md", "Mean difference"], ["smd", "SMD"]], val: "md",
      info: "Mean difference: the treatment effect in the outcome's own units (points). SMD: the same difference divided by a standard deviation, so it is unit-free." },
    { id: "stdz", label: "Standardize by", type: "select", val: "base", show: function (s) { return s.metric === "smd"; },
      options: [["base", "Pooled baseline SD"], ["post", "Pooled follow-up SD"], ["change", "SD of the change scores"]],
      info: "The SD the mean difference is divided by. The pooled baseline SD is the usual choice. The SD of change scores shrinks as the baseline–follow-up correlation grows, which inflates the SMD." },
    { id: "pop", label: "Analysis population", type: "select", val: "itt",
      options: [["itt", "Intention to treat"], ["pp", "Per protocol"], ["at", "As treated"]],
      info: "Intention to treat compares everyone as randomized and estimates the effect of being assigned the treatment. Per protocol keeps only people who followed their assignment; as treated compares people by the treatment they actually got. Both aim at the effect of receiving the treatment but break randomization." },
    { id: "est", label: "Estimator", type: "select", val: "ancova",
      options: [["ancova", "ANCOVA (adjusted for baseline)"], ["change", "Change scores"], ["post", "Follow-up scores only"], ["prepost", "Pre–post, treatment group only"]],
      info: "ANCOVA regresses the follow-up score on group and baseline. Change scores compare the groups' mean change. Follow-up only ignores baseline. Pre–post only uses the treatment group's change with no control group, so it also picks up time trends and regression to the mean." },
    { id: "miss", label: "Missing follow-up", type: "select", val: "cc",
      options: [["cc", "Complete cases"], ["bocf", "Baseline carried forward"], ["imp", "Regression imputation"]],
      info: "How people without a follow-up score are handled: drop them, assume they didn't change from baseline, or predict their follow-up from their baseline within their group (valid when dropout depends only on baseline)." }
  ];
  var GROUPS = [
    { title: "Trial", items: [
      { id: "n", label: "Participants randomized", min: 40, max: 1000, step: 20, val: 200, dp: 0, info: "Total number randomized, split equally between the arms." },
      { id: "delta", label: "True treatment effect (SMD)", min: 0, max: 1.5, step: 0.05, val: 0.5, info: "The effect of actually receiving the treatment, in true-score standard deviations. The mean difference in points is this times the outcome SD." },
      { id: "sd", label: "Outcome SD (points)", min: 1, max: 30, step: 1, val: 10, dp: 0, info: "The standard deviation of the outcome's true scores, in points. Sets the scale of the mean difference." },
      { id: "rho", label: "Baseline–follow-up correlation", min: 0, max: 0.95, step: 0.05, val: 0.6, info: "How strongly people's true follow-up scores track their true baseline scores. Higher values make baseline adjustment more useful." },
      { id: "trend", label: "Change over time in both arms (SD)", min: -0.5, max: 1, step: 0.05, val: 0.2, info: "Improvement everyone shows regardless of treatment (natural recovery, practice, placebo). A control group cancels it; a pre–post comparison without one does not." }] },
    { title: "Eligibility cutoff", toggle: "elig", items: [
      { id: "pe", label: "Share of screened people enrolled", min: 0.1, max: 1, step: 0.05, val: 0.3, info: "Only people with the lowest (worst) baseline scores are enrolled. Because baseline scores include measurement error and day-to-day noise, their follow-up scores drift back up: regression to the mean." }] },
    { title: "Allocation concealment failure", toggle: "conc", items: [
      { id: "shift", label: "Prognosis advantage in the treatment arm (SD)", min: 0, max: 0.6, step: 0.05, val: 0.2, info: "When recruiters can foresee the next assignment, they may steer healthier people into the treatment arm. This shifts the treatment arm's true scores up at baseline and follow-up." }] },
    { title: "Measurement error", toggle: "err", items: [
      { id: "rel", label: "Reliability of the outcome measure", min: 0.3, max: 1, step: 0.05, val: 0.7, info: "Share of the variance in measured scores that is true-score variance, at both baseline and follow-up. Error doesn't bias the mean difference, but it widens its CI, weakens baseline adjustment, and shrinks the SMD." }] },
    { title: "Non-adherence", toggle: "adh", items: [
      { id: "pnon", label: "Treatment arm: share who don't take the treatment", min: 0, max: 0.6, step: 0.05, val: 0.25, info: "People randomized to treatment who never take it. They dilute the intention-to-treat effect." },
      { id: "pcross", label: "Control arm: share who get the treatment anyway", min: 0, max: 0.4, step: 0.05, val: 0.1, info: "Crossover or contamination: people randomized to control who receive the treatment." },
      { id: "kappa", label: "How much adherence depends on prognosis", min: 0, max: 0.9, step: 0.05, val: 0.5, info: "0 means adherence is unrelated to how people would do. Higher values mean people with worse prognoses stop the treatment (or seek it out in the control arm) more often, which biases per-protocol and as-treated comparisons." }] },
    { title: "Attrition", toggle: "att", items: [
      { id: "dT", label: "Dropout in the treatment arm", min: 0, max: 0.6, step: 0.05, val: 0.2, info: "Share of the treatment arm with no follow-up score." },
      { id: "dC", label: "Dropout in the control arm", min: 0, max: 0.6, step: 0.05, val: 0.2, info: "Share of the control arm with no follow-up score. Equal rates in both arms is non-differential attrition; different rates is differential attrition." },
      { id: "mech", label: "Who drops out", type: "select", val: "mnar", options: [["mcar", "Anyone, at random"], ["mar", "People with worse baseline scores"], ["mnar", "People with worse follow-up outcomes"]],
        info: "At random: dropout is unrelated to the outcome. Worse baseline: related to something measured, which baseline adjustment or imputation can handle. Worse follow-up: related to the missing outcome itself, which no standard analysis can fully fix." },
      { id: "ms", label: "Strength of that dependence", min: 0, max: 0.9, step: 0.05, val: 0.5, show: function (s) { return s.mech !== "mcar"; }, info: "How strongly dropout depends on the scores chosen above, within each arm." }] },
    { title: "Unblinded outcome assessment", toggle: "blind", items: [
      { id: "ab", label: "Assessor bias favoring treatment (SD)", min: 0, max: 0.5, step: 0.05, val: 0.2, info: "When outcome assessors know who was treated, they may rate the treatment arm more favorably. Added to the treatment arm's follow-up scores." }] }
  ];
  var TOGGLES = ["elig", "conc", "err", "adh", "att", "blind"], DEFAULT_ON = { elig: false, conc: false, err: false, adh: true, att: true, blind: false };
  var ORDER = [
    { t: "elig", label: "+ Eligibility cutoff" }, { t: "conc", label: "+ Allocation concealment failure" }, { t: "err", label: "+ Measurement error" },
    { t: "adh", label: "+ Non-adherence" }, { t: "att", label: "+ Attrition" }, { t: "blind", label: "+ Unblinded assessment" }];
  var PRESETS = [
    { name: "Clean trial (no artifacts)", set: {}, on: {} },
    { name: "Non-adherence: ITT vs per protocol", set: { pnon: 0.3, pcross: 0.1, kappa: 0.6 }, on: { adh: 1 } },
    { name: "Differential attrition", set: { dT: 0.1, dC: 0.35, mech: "mnar", ms: 0.6 }, on: { att: 1 } },
    { name: "Non-differential attrition", set: { dT: 0.3, dC: 0.3, mech: "mnar", ms: 0.6 }, on: { att: 1 } },
    { name: "Regression to the mean (no control group)", set: { pe: 0.25, rel: 0.7, trend: 0 }, on: { elig: 1, err: 1 }, an: { est: "prepost" } },
    { name: "Allocation concealment failure", set: { shift: 0.3, rel: 0.7 }, on: { conc: 1, err: 1 } },
    { name: "Unblinded assessors", set: { ab: 0.25 }, on: { blind: 1 } },
    { name: "Noisy outcome measure (MD vs SMD)", set: { rel: 0.5 }, on: { err: 1 }, an: { metric: "smd" } },
    { name: "Everything at once", set: { pe: 0.5, shift: 0.15, rel: 0.75, pnon: 0.2, pcross: 0.1, kappa: 0.5, dT: 0.15, dC: 0.3, mech: "mnar", ms: 0.5, ab: 0.15 },
      on: { elig: 1, conc: 1, err: 1, adh: 1, att: 1, blind: 1 } }
  ];
  var ITEMS = ANALYSIS.slice(); GROUPS.forEach(function (g) { ITEMS = ITEMS.concat(g.items); });
  function defaults() {
    var s = { on: {} };
    ITEMS.forEach(function (c) { s[c.id] = c.val; });
    TOGGLES.forEach(function (t) { s.on[t] = DEFAULT_ON[t]; });
    return s;
  }
  var state = defaults(), view = "sample", seed = 8675309;

  // ==================================================== 2. the trial model
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var spare = null;
    return function () {
      if (spare !== null) { var t = spare; spare = null; return t; }
      var m = Math.sqrt(-2 * Math.log(1 - rng())), v = 2 * Math.PI * rng();
      spare = m * Math.sin(v); return m * Math.cos(v);
    };
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
  // effective settings: artifacts that are switched off become neutral
  function eff(s, on) {
    return {
      delta: s.delta, rho: s.rho, trend: s.trend,
      pe: on.elig ? s.pe : 1, shift: on.conc ? s.shift : 0, rel: on.err ? s.rel : 1,
      pnon: on.adh ? s.pnon : 0, pcross: on.adh ? s.pcross : 0, kappa: s.kappa,
      dT: on.att ? s.dT : 0, dC: on.att ? s.dC : 0, mech: s.mech, ms: s.ms, ab: on.blind ? s.ab : 0
    };
  }
  // One trial. True baseline z0 ~ N(0, 1); true follow-up = trend + rho*z0 +
  // sqrt(1 - rho^2)*eps + delta*(received treatment). Measured scores add error
  // with the chosen reliability. Arms are split 1:1 (people are exchangeable,
  // so the first half is the treatment arm).
  function simulate(p, n, sd0) {
    var rng = mulberry32(sd0), g = gauss(rng), ev = p.rel < 1 ? (1 - p.rel) / p.rel : 0, se = Math.sqrt(ev);
    var cut = p.pe < 1 ? qnorm(p.pe) * Math.sqrt(1 + ev) : Infinity;
    var nT = Math.round(n / 2), A = new Uint8Array(n), R = new Uint8Array(n), drop = new Uint8Array(n);
    var y0 = new Float64Array(n), y1 = new Float64Array(n), W = new Float64Array(n);
    var tNon = qnorm(p.pnon), tCross = qnorm(p.pcross), k = p.kappa, kc = Math.sqrt(1 - k * k), r = p.rho, rc = Math.sqrt(1 - r * r);
    var i = 0, guard = 0;
    while (i < n && guard < n * 400) {
      guard++;
      var z0 = g(), e0 = g() * se, eps = g(), e1 = g() * se, u = g(), w = g();
      if (z0 + e0 > cut) continue;                       // eligibility: lowest baseline scores only
      var a = i < nT ? 1 : 0, sh = a ? p.shift : 0;
      A[i] = a;
      y0[i] = z0 + sh + e0;
      var z1 = p.trend + r * z0 + rc * eps + sh;
      var adh = k * eps + kc * u;                        // worse prognosis -> lower adherence / more crossover
      R[i] = a ? (adh >= tNon ? 1 : 0) : (adh < tCross ? 1 : 0);
      y1[i] = z1 + p.delta * R[i] + e1 + (a ? p.ab : 0);
      W[i] = w; i++;
    }
    n = i;
    // attrition within each arm, at the chosen rate
    [1, 0].forEach(function (arm) {
      var pd = arm ? p.dT : p.dC; if (!(pd > 0)) return;
      var thr = qnorm(1 - pd), s = p.mech === "mcar" ? 0 : p.ms, sc = Math.sqrt(1 - s * s), Z = p.mech === "mar" ? y0 : y1;
      var m = 0, q = 0, c = 0, j;
      for (j = 0; j < n; j++) if (A[j] === arm) { m += Z[j]; q += Z[j] * Z[j]; c++; }
      m /= c; var sdz = Math.sqrt(Math.max(1e-12, q / c - m * m));
      for (j = 0; j < n; j++) if (A[j] === arm) drop[j] = (s * (-(Z[j] - m) / sdz) + sc * W[j]) > thr ? 1 : 0;
    });
    return { n: n, A: A, R: R, y0: y0, y1: y1, drop: drop };
  }

  // ======================================================= 3. analysis
  function solve3(M, v) {
    var a = M.map(function (r, i) { return r.concat([v[i]]); }), i, j, k;
    for (i = 0; i < 3; i++) {
      var p = i; for (j = i + 1; j < 3; j++) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
      if (Math.abs(a[p][i]) < 1e-12) return null;
      var t = a[i]; a[i] = a[p]; a[p] = t;
      for (j = 0; j < 3; j++) if (j !== i) { var f = a[j][i] / a[i][i]; for (k = i; k < 4; k++) a[j][k] -= f * a[i][k]; }
    }
    return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
  }
  function inv3(M) {
    var c = [];
    for (var i = 0; i < 3; i++) { var e = [0, 0, 0]; e[i] = 1; var x = solve3(M, e); if (!x) return null; c.push(x); }
    return [[c[0][0], c[1][0], c[2][0]], [c[0][1], c[1][1], c[2][1]], [c[0][2], c[1][2], c[2][2]]];
  }
  // Returns the estimate in true-score SD units with its SE, the three
  // candidate standardizers, and what is needed for plots and flow counts.
  function analyze(d, an) {
    var n = d.n, i, inc = new Uint8Array(n), grp = new Uint8Array(n), has = new Uint8Array(n), Y1 = new Float64Array(n), imp = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      if (an.pop === "itt") { inc[i] = 1; grp[i] = d.A[i]; }
      else if (an.pop === "pp") { inc[i] = d.R[i] === d.A[i] ? 1 : 0; grp[i] = d.A[i]; }
      else { inc[i] = 1; grp[i] = d.R[i]; }
      if (!inc[i]) continue;
      if (!d.drop[i]) { Y1[i] = d.y1[i]; has[i] = 1; }
      else if (an.miss === "bocf") { Y1[i] = d.y0[i]; has[i] = 1; imp[i] = 1; }
    }
    if (an.miss === "imp") {
      [0, 1].forEach(function (gv) {
        var c = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (var j = 0; j < n; j++) if (inc[j] && grp[j] === gv && !d.drop[j]) { c++; sx += d.y0[j]; sy += d.y1[j]; sxx += d.y0[j] * d.y0[j]; sxy += d.y0[j] * d.y1[j]; }
        if (c < 3) return;
        var b = (sxy - sx * sy / c) / (sxx - sx * sx / c), a0 = sy / c - b * sx / c;
        for (j = 0; j < n; j++) if (inc[j] && grp[j] === gv && d.drop[j]) { Y1[j] = a0 + b * d.y0[j]; has[j] = 1; imp[j] = 1; }
      });
    }
    // group summaries
    var S = [0, 1].map(function () { return { nb: 0, b: 0, bb: 0, n: 0, f: 0, ff: 0, fb: 0, c: 0, cc: 0 }; });
    for (i = 0; i < n; i++) {
      if (!inc[i]) continue;
      var t = S[grp[i]], x = d.y0[i];
      t.nb++; t.b += x; t.bb += x * x;
      if (!has[i]) continue;
      var y = Y1[i], ch = y - x;
      t.n++; t.f += y; t.ff += y * y; t.fb += y * x; t.c += ch; t.cc += ch * ch;
    }
    function v(sum, sq, k) { return k > 1 ? (sq - sum * sum / k) / (k - 1) : NaN; }
    function pooled(key, key2, kk) { var a = S[0], b = S[1]; return Math.sqrt(((a[kk] - 1) * v(a[key], a[key2], a[kk]) + (b[kk] - 1) * v(b[key], b[key2], b[kk])) / (a[kk] + b[kk] - 2)); }
    var out = { inc: inc, grp: grp, has: has, Y1: Y1, imp: imp, S: S, est: NaN, se: NaN,
      std: { base: pooled("b", "bb", "nb"), post: pooled("f", "ff", "n"), change: pooled("c", "cc", "n") } };
    var s0 = S[0], s1 = S[1];
    if (an.est === "prepost") {
      if (s1.n > 1) { out.est = s1.c / s1.n; out.se = Math.sqrt(v(s1.c, s1.cc, s1.n) / s1.n); }
      return out;
    }
    if (s0.n < 2 || s1.n < 2) return out;
    if (an.est === "post") { out.est = s1.f / s1.n - s0.f / s0.n; out.se = Math.sqrt(v(s1.f, s1.ff, s1.n) / s1.n + v(s0.f, s0.ff, s0.n) / s0.n); }
    else if (an.est === "change") { out.est = s1.c / s1.n - s0.c / s0.n; out.se = Math.sqrt(v(s1.c, s1.cc, s1.n) / s1.n + v(s0.c, s0.cc, s0.n) / s0.n); }
    else { // ANCOVA: y1 = b0 + b1*group + b2*y0 (people with a follow-up score, incl. imputed)
      var N = 0, sg = 0, sb = 0, sy = 0, sgb = 0, sbb = 0, sgy = 0, sby = 0, syy = 0;
      for (i = 0; i < n; i++) {
        if (!inc[i] || !has[i]) continue;
        var gg = grp[i], bb = d.y0[i], yy = Y1[i];
        N++; sg += gg; sb += bb; sy += yy; sgb += gg * bb; sbb += bb * bb; sgy += gg * yy; sby += bb * yy; syy += yy * yy;
      }
      var XtX = [[N, sg, sb], [sg, sg, sgb], [sb, sgb, sbb]], Xty = [sy, sgy, sby], beta = solve3(XtX, Xty), Ai = inv3(XtX);
      if (beta && Ai) {
        var rss = syy - (beta[0] * sy + beta[1] * sgy + beta[2] * sby), s2 = rss / (N - 3);
        out.est = beta[1]; out.se = Math.sqrt(Math.max(0, s2 * Ai[1][1]));
      }
    }
    return out;
  }
  var AN_KEYS = ["metric", "stdz", "pop", "est", "miss"];
  function anOf(s) { var o = {}; AN_KEYS.forEach(function (k) { o[k] = s[k]; }); return o; }
  // convert an analysis result to the chosen metric (points or SMD)
  function metric(res, an, sdPts) {
    var k = an.metric === "md" ? sdPts : 1 / res.std[an.stdz];
    return { v: res.est * k, lo: (res.est - 1.96 * res.se) * k, hi: (res.est + 1.96 * res.se) * k };
  }

  // ======================================== 4. estimands and expected values
  // True ITT effect = delta x (share treated in the treatment arm - share treated
  // in the control arm). True per-protocol effect = delta. Both in true-score SD
  // units; points = x outcome SD.
  function truths(s) {
    var e = eff(s, s.on), itt = s.delta * ((1 - e.pnon) - e.pcross), k = s.metric === "md" ? s.sd : 1;
    return { itt: itt * k, pp: s.delta * k, target: (s.pop === "itt" ? itt : s.delta) * k };
  }
  var NP = 30000, POPSEED = 987654321;
  function expectedFor(s, on) {
    var d = simulate(eff(s, on), NP, POPSEED), res = analyze(d, anOf(s));
    return metric(res, anOf(s), s.sd).v;
  }
  var breakdown = null;
  function sigOf(withN) {
    var o = {}; ITEMS.forEach(function (c) { if (withN || c.id !== "n") o[c.id] = state[c.id]; }); o.on = state.on;
    return JSON.stringify(o);
  }
  function computeBreakdown() {
    var s = state, on = {}, rows = [{ label: "No artifacts", v: expectedFor(s, on) }];
    ORDER.forEach(function (st) { if (!s.on[st.t]) return; on[st.t] = 1; rows.push({ label: st.label, v: expectedFor(s, on) }); });
    breakdown = { sig: sigOf(false), rows: rows, expected: rows[rows.length - 1].v };
  }

  // ======================================================= 5. rendering
  function f2(x) { return isFinite(x) ? x.toFixed(2).replace(/^-0\.00$/, "0.00") : "—"; }
  function esc(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  var el = { stats: app.querySelector(".as-stats"), svg: app.querySelector(".as-plot"), legend: app.querySelector(".as-legend"),
    budget: app.querySelector(".as-budget"), flow: app.querySelector(".tr-flow") };
  var svg = el.svg, W = 640, H = 420;
  function sizePlot(h) {
    W = Math.round(Math.max(300, Math.min(760, svg.parentNode.clientWidth || 640))); H = h;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  }
  function tiles(list) {
    el.stats.innerHTML = list.map(function (t) {
      return '<div class="as-stat"><div class="as-key">' + t[0] + '</div><div class="as-stat-val' + (t[2] ? " " + t[2] : "") + '">' + t[1] + "</div>" +
        (t[3] ? '<div class="rs-sub">' + t[3] + "</div>" : "") + "</div>";
    }).join("");
  }
  function legend(list) {
    el.legend.innerHTML = list.map(function (t) {
      return "<span>" + (t[0] ? '<svg viewBox="-7 -7 14 14" class="as-plot" aria-hidden="true">' + t[0] + "</svg>" : "") + t[1] + "</span>";
    }).join("");
  }
  function unit(s) { return s.metric === "md" ? "MD" : "SMD"; }
  function groupNames(s) { return s.pop === "at" ? ["Did not receive treatment", "Received treatment"] : ["Control arm", "Treatment arm"]; }
  function niceStep(span, n) { var raw = span / (n || 6), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  var last = "";

  function renderSample() {
    sizePlot(H);
    var s = state, an = anOf(s), d = simulate(eff(s, s.on), s.n, seed), res = analyze(d, an), m = metric(res, an, s.sd), tr = truths(s), U = unit(s);
    var ex = breakdown ? breakdown.expected : NaN, stale = !breakdown || breakdown.sig !== sigOf(false);
    var nAn = res.S[0].n + res.S[1].n;
    tiles([["Estimated " + U, f2(m.v), "as-lead", "95% CI " + f2(m.lo) + " to " + f2(m.hi)],
      ["Expected " + U, f2(ex), stale ? "is-stale" : "", "very large trial"],
      ["True ITT effect", f2(tr.itt), "", s.pop === "itt" ? "target of this analysis" : ""],
      ["True per-protocol effect", f2(tr.pp), "", s.pop !== "itt" ? "target of this analysis" : ""],
      ["n analyzed", nAn + " / " + d.n]]);
    last = "Estimated " + U + " = " + f2(m.v) + " (95% CI " + f2(m.lo) + " to " + f2(m.hi) + ") · true ITT = " + f2(tr.itt) + " · true per protocol = " + f2(tr.pp);
    // spaghetti plot of baseline and follow-up, in points (baseline mean 50)
    sizePlot(W < 520 ? Math.round(W * 0.95) : Math.round(W * 0.6));
    var P = function (v) { return 50 + s.sd * v; }, ys = [], i;
    for (i = 0; i < d.n; i++) if (res.inc[i]) { ys.push(P(d.y0[i])); if (res.has[i]) ys.push(P(res.Y1[i])); }
    ys.sort(function (a, b) { return a - b; });
    var lo = ys[Math.floor(ys.length * 0.01)], hi = ys[Math.ceil(ys.length * 0.99) - 1], pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    var M = { l: 54, r: 16, t: 16, b: 44 }, bt = H - M.b, sy = function (v) { return bt - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (bt - M.t); };
    var x0 = M.l + (W - M.l - M.r) * 0.2, x1 = M.l + (W - M.l - M.r) * 0.8, h = "", st = niceStep(hi - lo, 6);
    for (var t = Math.ceil(lo / st) * st; t <= hi; t += st) {
      h += '<text x="' + (M.l - 8) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + (+t.toFixed(2)) + "</text>";
    }
    h += '<rect class="as-frame" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (bt - M.t) + '"/>';
    h += '<text class="as-axis-title" x="' + x0 + '" y="' + (bt + 22) + '" text-anchor="middle">Baseline</text><text class="as-axis-title" x="' + x1 + '" y="' + (bt + 22) + '" text-anchor="middle">Follow-up</text>';
    h += '<text class="as-axis-title" transform="translate(15,' + ((M.t + bt) / 2) + ') rotate(-90)" text-anchor="middle">Outcome (points)</text>';
    var jit = function (k) { var q = Math.sin(k * 12.9898) * 43758.5453; return (q - Math.floor(q) - 0.5) * 14; };
    var lines = "", dots = "", drops = "";
    for (i = 0; i < d.n; i++) {
      if (!res.inc[i]) continue;
      var cls = res.grp[i] ? "tr-tx" : "tr-ct", a0 = x0 + jit(i), a1 = x1 + jit(i + 7777);
      if (res.has[i] && !res.imp[i]) {
        var b0 = sy(P(d.y0[i])).toFixed(1), b1 = sy(P(res.Y1[i])).toFixed(1);
        lines += '<line class="tr-ind ' + cls + '" x1="' + a0.toFixed(1) + '" y1="' + b0 + '" x2="' + a1.toFixed(1) + '" y2="' + b1 + '"/>';
        // small solid dots at both ends of each person's line
        dots += '<circle class="tr-ind-pt ' + cls + '" cx="' + a0.toFixed(1) + '" cy="' + b0 + '" r="1.8"/><circle class="tr-ind-pt ' + cls + '" cx="' + a1.toFixed(1) + '" cy="' + b1 + '" r="1.8"/>';
      }
      else if (res.has[i] && res.imp[i]) {
        // imputed follow-up: open circles joined by a dashed line
        var c0 = sy(P(d.y0[i])).toFixed(1), c1 = sy(P(res.Y1[i])).toFixed(1);
        drops += '<line class="tr-imp ' + cls + '" x1="' + a0.toFixed(1) + '" y1="' + c0 + '" x2="' + a1.toFixed(1) + '" y2="' + c1 + '"/>' +
          '<circle class="tr-drop ' + cls + '" cx="' + a0.toFixed(1) + '" cy="' + c0 + '" r="2.4"/><circle class="tr-drop ' + cls + '" cx="' + a1.toFixed(1) + '" cy="' + c1 + '" r="2.4"/>';
      } else {
        // no follow-up score and not imputed: a small x at baseline
        var xx = a0, yy = sy(P(d.y0[i])), q = 2.6;
        drops += '<path class="tr-x ' + cls + '" d="M' + (xx - q).toFixed(1) + "," + (yy - q).toFixed(1) + "L" + (xx + q).toFixed(1) + "," + (yy + q).toFixed(1) +
          "M" + (xx - q).toFixed(1) + "," + (yy + q).toFixed(1) + "L" + (xx + q).toFixed(1) + "," + (yy - q).toFixed(1) + '"/>';
      }
    }
    h += lines + dots + drops;
    [0, 1].forEach(function (gv) {
      var S = res.S[gv]; if (!S.nb || !S.n) return;
      var mb = P(S.b / S.nb), mf = P(S.f / S.n), cls = gv ? "tr-tx" : "tr-ct";
      h += '<line class="tr-mean ' + cls + '" x1="' + x0 + '" y1="' + sy(mb) + '" x2="' + x1 + '" y2="' + sy(mf) + '"/>';
      h += '<circle class="tr-mean-pt ' + cls + '" cx="' + x0 + '" cy="' + sy(mb) + '" r="5.5"/><circle class="tr-mean-pt ' + cls + '" cx="' + x1 + '" cy="' + sy(mf) + '" r="5.5"/>';
      var right = gv ? -1 : 1;
      h += '<text class="tr-mean-lab ' + cls + '" x="' + (x1 + 10) + '" y="' + (sy(mf) + 4 + right * 0) + '">' + f2(mf) + "</text>";
    });
    svg.innerHTML = h;
    var names = groupNames(s);
    legend([['<line class="tr-mean tr-tx" x1="-7" x2="7" y1="0" y2="0"/>', names[1] + " (mean)"], ['<line class="tr-mean tr-ct" x1="-7" x2="7" y1="0" y2="0"/>', names[0] + " (mean)"],
      ['<line class="tr-ind tr-tx tr-ind-key" x1="-6" x2="6" y1="4" y2="-4"/><circle class="tr-ind-pt tr-tx tr-ind-key" cx="-6" cy="4" r="1.8"/><circle class="tr-ind-pt tr-tx tr-ind-key" cx="6" cy="-4" r="1.8"/>', "One person"], s.miss === "cc" ? ['<path class="tr-x tr-ct" d="M-3,-3L3,3M-3,3L3,-3"/>', "No follow-up score"]
        : ['<line class="tr-imp tr-ct" x1="-6" x2="6" y1="4" y2="-4"/><circle class="tr-drop tr-ct" cx="-6" cy="4" r="2.4"/><circle class="tr-drop tr-ct" cx="6" cy="-4" r="2.4"/>', "Imputed follow-up score"]]);
    renderFlow(d, res);
  }

  // participant flow, like a CONSORT diagram in table form
  function renderFlow(d, res) {
    var rows = [1, 0].map(function (arm) {
      var o = { rand: 0, rec: 0, drop: 0, an: 0 };
      for (var i = 0; i < d.n; i++) {
        if (d.A[i] !== arm) continue;
        o.rand++; o.rec += d.R[i]; o.drop += d.drop[i];
        if (res.inc[i] && res.has[i]) o.an++;
      }
      return o;
    });
    el.flow.hidden = false;
    el.flow.innerHTML = '<div class="as-key">Participant flow</div><table><thead><tr><th></th><th class="as-key as-num">Randomized</th><th class="as-key as-num">Received treatment</th><th class="as-key as-num">No follow-up</th><th class="as-key as-num">Analyzed</th></tr></thead><tbody>' +
      ["Treatment arm", "Control arm"].map(function (lab, j) {
        var o = rows[j];
        return '<tr><th><span class="tr-sw ' + (j ? "tr-ct" : "tr-tx") + '"></span>' + lab + '</th><td class="as-num">' + o.rand + '</td><td class="as-num">' + o.rec + '</td><td class="as-num">' + o.drop + '</td><td class="as-num">' + o.an + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  // ---- replications
  var REPS = 1000, repl = null, replToken = 0, replTimer = null, running = null;
  function status(msg) { svg.innerHTML = '<text class="as-status" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">' + esc(msg) + "</text>"; }
  function runRepl() {
    var token = ++replToken, s = state, sig = sigOf(true) + "|" + seed, p = eff(s, s.on), an = anOf(s), tr = truths(s).target;
    var vals = [], cover = 0, power = 0, k = 0;
    running = sig;
    (function chunk() {
      if (token !== replToken) return;
      for (var i = 0; i < 25 && k < REPS; i++, k++) {
        var d = simulate(p, s.n, (seed * 31 + (k + 1) * 7919) >>> 0), m = metric(analyze(d, an), an, s.sd);
        if (!isFinite(m.v)) continue;
        vals.push(m.v);
        if (m.lo <= tr && tr <= m.hi) cover++;
        if (m.lo > 0 || m.hi < 0) power++;
      }
      if (k < REPS) { if (view === "repl") status("Running " + k + " / " + REPS + " trials…"); setTimeout(chunk, 0); }
      else { running = null; repl = { sig: sig, vals: vals, cover: cover / vals.length, power: power / vals.length }; if (view === "repl") render(); }
    })();
  }
  function mean(a) { var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }
  function sdv(a) { var m = mean(a), s = 0; a.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / (a.length - 1)); }
  function renderRepl() {
    var s = state, U = unit(s), tr = truths(s), ex = breakdown ? breakdown.expected : NaN;
    el.flow.hidden = true;
    sizePlot(H); sizePlot(W < 520 ? Math.round(W * 0.9) : Math.round(W * 0.62));
    if (!repl || repl.sig !== sigOf(true) + "|" + seed) {
      status("Running " + REPS + " trials…");
      tiles([["Mean estimate", "…", "is-stale"], ["SD of estimates", "…", "is-stale"], ["True target", f2(tr.target)], ["CI coverage", "…", "is-stale"], ["Power", "…", "is-stale"]]);
      if (running !== sigOf(true) + "|" + seed) { clearTimeout(replTimer); replTimer = setTimeout(runRepl, 150); }
      el.legend.innerHTML = "";
      return;
    }
    var v = repl.vals;
    tiles([["Mean estimated " + U, f2(mean(v)), "as-lead", REPS + " simulated trials"], ["SD of estimates", f2(sdv(v)), "", "sampling error"],
      [s.pop === "itt" ? "True ITT effect" : "True per-protocol effect", f2(tr.target), "", "target of this analysis"],
      ["CI coverage", Math.round(repl.cover * 100) + "%", "", "95% CIs that contain the target"], ["Power", Math.round(repl.power * 100) + "%", "", "95% CIs that exclude 0"]]);
    last = REPS + " trials, n = " + s.n + " · mean estimated " + U + " = " + f2(mean(v)) + " · target = " + f2(tr.target) + " · CI coverage " + Math.round(repl.cover * 100) + "% · power " + Math.round(repl.power * 100) + "%";
    var all = v.slice().sort(function (a, b) { return a - b; });
    var lo = Math.min(all[Math.floor(all.length * 0.002)], tr.target, ex, 0), hi = Math.max(all[Math.ceil(all.length * 0.998) - 1], tr.target, ex, 0);
    if (!isFinite(lo)) lo = Math.min(all[0], tr.target, 0); if (!isFinite(hi)) hi = Math.max(all[all.length - 1], tr.target, 0);
    var pad = (hi - lo) * 0.06 || 0.1; lo -= pad; hi += pad;
    var ml = W < 520 ? 44 : 54, mr = 12, nb = W < 520 ? 30 : 44, bw = (hi - lo) / nb;
    var hist = new Array(nb).fill(0); v.forEach(function (x) { var i = Math.floor((x - lo) / bw); if (i >= 0 && i < nb) hist[i]++; });
    var top = Math.max.apply(null, hist), yMax = Math.ceil(top * 1.12 / 10) * 10 || 10;
    var bt = H - 48, sx = function (x) { return ml + (x - lo) / (hi - lo) * (W - ml - mr); }, sy = function (c) { return bt - c / yMax * (bt - 14); };
    var h = "", i, ys = yMax <= 50 ? 10 : yMax <= 100 ? 20 : yMax <= 250 ? 50 : 100;
    for (var u = 0; u <= yMax; u += ys) h += '<text x="' + (ml - 8) + '" y="' + (sy(u) + 4) + '" text-anchor="end">' + u + "</text>";
    var xs = niceStep(hi - lo, 6);
    for (var t = Math.ceil(lo / xs) * xs; t <= hi; t += xs) h += '<text x="' + sx(t) + '" y="' + (bt + 18) + '" text-anchor="middle">' + (+t.toFixed(2)) + "</text>";
    h += '<rect class="as-frame" x="' + ml + '" y="14" width="' + (W - ml - mr) + '" height="' + (bt - 14) + '"/>';
    h += '<text class="as-axis-title" x="' + ((ml + W - mr) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">Estimated ' + (s.metric === "md" ? "mean difference (points)" : "SMD") + " across " + REPS + " trials</text>";
    h += '<text class="as-axis-title" transform="translate(15,' + ((14 + bt) / 2) + ') rotate(-90)" text-anchor="middle">Count</text>';
    for (i = 0; i < nb; i++) if (hist[i]) h += '<rect class="as-hist-obs" x="' + (sx(lo + i * bw) + 0.5) + '" y="' + sy(hist[i]) + '" width="' + Math.max(0.5, sx(lo + bw) - sx(lo) - 1) + '" height="' + (bt - sy(hist[i])) + '"/>';
    h += '<line class="as-zero" x1="' + sx(0) + '" x2="' + sx(0) + '" y1="14" y2="' + bt + '"/>';
    function vline(x, cls, label, dy) {
      if (!isFinite(x)) return "";
      var X = sx(x), right = X > W * 0.7;
      return '<line class="' + cls + '" x1="' + X + '" x2="' + X + '" y1="14" y2="' + bt + '"/><text class="as-vl-label" x="' + (X + (right ? -6 : 6)) + '" y="' + (30 + dy) + '" text-anchor="' + (right ? "end" : "start") + '">' + label + "</text>";
    }
    h += vline(tr.target, "as-vl-true", "Target " + f2(tr.target), 0) + vline(ex, "as-vl-exp", "Expected " + f2(ex), 18);
    svg.innerHTML = h;
    legend([['<rect class="as-hist-obs" x="-7" y="-7" width="14" height="14"/>', "Estimates"], ['<line class="as-vl-true" x1="0" x2="0" y1="-7" y2="7"/>', "True target effect"],
      ['<line class="as-vl-exp" x1="0" x2="0" y1="-7" y2="7"/>', "Expected (very large trial)"]]);
  }

  // ---- bias breakdown (same layout as the Artifact Simulator)
  function renderBreakdown() {
    var b = breakdown, s = state, U = unit(s), tr = truths(s);
    if (!b) { el.budget.innerHTML = ""; return; }
    var base = b.rows[0].v, html = "", prev = base;
    var span = Math.max.apply(null, b.rows.map(function (r) { return Math.abs(r.v); }).concat([Math.abs(tr.target), 1e-9]));
    b.rows.forEach(function (r, i) {
      var ch = i === 0 ? "" : (isFinite(r.v) && isFinite(prev) ? (r.v - prev >= 0 ? "+" : "−") + Math.abs(r.v - prev).toFixed(2) : "—");
      var w = isFinite(r.v) ? Math.max(0, Math.min(100, Math.abs(r.v) / span * 100)) : 0;
      html += "<tr><td>" + esc(r.label) + '<div class="as-bar"><i style="width:' + w.toFixed(1) + '%"></i></div></td><td class="as-num">' + f2(r.v) + '</td><td class="as-num as-loss">' + ch + "</td></tr>";
      prev = r.v;
    });
    var bias = b.expected - tr.target;
    el.budget.className = "as-budget" + (b.sig === sigOf(false) ? "" : " is-stale");
    el.budget.innerHTML = '<div class="as-key">Bias breakdown</div><table><thead><tr><th class="as-key">Step</th><th class="as-key as-num">Expected ' + U +
      '</th><th class="as-key as-num">Change</th></tr></thead><tbody>' + html + "</tbody><tfoot>" +
      "<tr><td>" + (s.pop === "itt" ? "True ITT effect (target)" : "True per-protocol effect (target)") + '</td><td class="as-num">' + f2(tr.target) + "</td><td></td></tr>" +
      '<tr><td>Bias (expected − target)</td><td class="as-num">' + f2(b.expected) + '</td><td class="as-num as-loss">' + (bias >= 0 ? "+" : "−") + Math.abs(bias).toFixed(2) + "</td></tr></tfoot></table>" +
      '<p class="as-note">Artifacts are added one at a time, in the order of the controls, with the analysis settings above. <em>Expected</em> is the average result of a very large trial (' + NP.toLocaleString() +
      " simulated participants), so sampling error is negligible. Non-adherence changes the ITT target itself, so the target is shown separately.</p>";
  }

  function render() {
    if (view === "repl") renderRepl(); else renderSample();
    renderBreakdown();
  }

  // ================================== 6. export, URL state, wiring
  function styled(clone) {
    var src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
    var props = ["fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight", "letter-spacing"];
    for (var i = 0; i < src.length; i++) {
      var cs = getComputedStyle(src[i]), st = "";
      props.forEach(function (p) { st += p + ":" + cs.getPropertyValue(p) + ";"; });
      dst[i].setAttribute("style", st); dst[i].removeAttribute("class");
    }
    return clone;
  }
  function exportSvg() {
    var head = 34, pad = 12, clone = styled(svg.cloneNode(true)), bs = getComputedStyle(document.body);
    clone.setAttribute("xmlns", NS); clone.setAttribute("viewBox", (-pad) + " " + (-head) + " " + (W + 2 * pad) + " " + (H + head + pad));
    clone.setAttribute("width", W + 2 * pad); clone.setAttribute("height", H + head + pad);
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", -pad); bg.setAttribute("y", -head); bg.setAttribute("width", W + 2 * pad); bg.setAttribute("height", H + head + pad); bg.setAttribute("fill", bs.backgroundColor);
    clone.insertBefore(bg, clone.firstChild);
    var tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", 0); tx.setAttribute("y", -12);
    tx.setAttribute("style", "font-family:Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;fill:" + bs.color);
    tx.textContent = last; clone.appendChild(tx);
    return new XMLSerializer().serializeToString(clone);
  }
  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fileName(ext) { return "trial-simulator-" + (view === "repl" ? "replications" : "sample") + "." + ext; }
  function downloadPng() {
    var img = new Image(), url = URL.createObjectURL(new Blob([exportSvg()], { type: "image/svg+xml" }));
    img.onload = function () {
      var c = document.createElement("canvas"), k = 2; c.width = img.width * k; c.height = img.height * k;
      var ctx = c.getContext("2d"); ctx.scale(k, k); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      c.toBlob(function (b) { download(b, fileName("png")); }, "image/png");
    };
    img.src = url;
  }
  function writeHash() {
    var d = defaults(), parts = [];
    if (view !== "sample") parts.push("v=" + view);
    parts.push("s=" + seed);
    ITEMS.forEach(function (c) { if (state[c.id] !== d[c.id]) parts.push(c.id + "=" + encodeURIComponent(state[c.id])); });
    TOGGLES.forEach(function (t) { if (state.on[t] !== d.on[t]) parts.push("on." + t + "=" + (state.on[t] ? 1 : 0)); });
    try { history.replaceState(null, "", "#" + parts.join("&")); } catch (e) { /* ignore */ }
  }
  function readHash() {
    (location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("="), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || "");
      if (k === "v") { if (v === "repl" || v === "sample") view = v; return; }
      if (k === "s") { if (/^\d+$/.test(v)) seed = Number(v) >>> 0; return; }
      if (/^on\./.test(k)) { var t = k.slice(3); if (TOGGLES.indexOf(t) >= 0) state.on[t] = v === "1"; return; }
      var c = ITEMS.filter(function (x) { return x.id === k; })[0];
      if (!c) return;
      if (c.options) { if (c.options.some(function (o) { return o[0] === v; })) state[k] = v; }
      else { var num = Number(v); if (isFinite(num)) state[k] = Math.min(c.max, Math.max(c.min, num)); }
    });
  }

  function fmtVal(c, v) { return Number(v).toFixed(c.dp === undefined ? 2 : c.dp); }
  function infoTip(c, uid) {
    if (!c.info) return "";
    return '<button type="button" class="as-info" aria-label="About: ' + c.label + '" aria-describedby="' + uid + '-tip" aria-expanded="false">i</button>' +
      '<span class="as-tip" role="tooltip" id="' + uid + '-tip">' + c.info + "</span>";
  }
  var panel = app.querySelector(".as-panel");
  function field(c) {
    var f = document.createElement("div"), uid = "tr-" + c.id;
    f.className = "as-field"; f.dataset.id = c.id;
    if (c.type === "radio") {
      f.innerHTML = '<div class="as-field-head"><span class="as-lab"><span class="as-field-label" id="' + uid + '-l">' + c.label + "</span>" + infoTip(c, uid) + '</span></div><div class="as-seg" role="radiogroup" aria-labelledby="' + uid + '-l">' +
        c.options.map(function (o) { return '<label><input type="radio" name="' + uid + '" value="' + o[0] + '">' + o[1] + "</label>"; }).join("") + "</div>";
      f.addEventListener("change", function (ev) { state[c.id] = ev.target.value; syncPanel(); markCustom(); changed(); });
    } else if (c.type === "select") {
      f.innerHTML = '<div class="as-field-head"><span class="as-lab"><label for="' + uid + '">' + c.label + "</label>" + infoTip(c, uid) + '</span></div><select class="tr-select" id="' + uid + '">' +
        c.options.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>";
      f.querySelector("select").addEventListener("change", function (ev) { state[c.id] = ev.target.value; syncPanel(); markCustom(); changed(); });
    } else {
      f.innerHTML = '<div class="as-field-head"><span class="as-lab"><label for="' + uid + '">' + c.label + "</label>" + infoTip(c, uid) + '</span><span class="as-val"></span></div>' +
        '<input type="range" id="' + uid + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">';
      f.querySelector("input").addEventListener("input", function (ev) {
        state[c.id] = Number(ev.target.value);
        f.querySelector(".as-val").textContent = fmtVal(c, state[c.id]);
        markCustom(); changed();
      });
    }
    return f;
  }
  function buildPanel() {
    var ag = document.createElement("div"); ag.className = "as-group tr-analysis";
    ag.innerHTML = '<div class="as-group-head"><span class="as-key">Analysis</span></div>';
    ANALYSIS.forEach(function (c) { ag.appendChild(field(c)); });
    panel.appendChild(ag);
    panel.insertAdjacentHTML("beforeend", '<label class="as-preset"><span class="as-key">Scenario</span><select><option value="">Custom settings</option><option value="reset">Default settings</option>' +
      PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + "</option>"; }).join("") + "</select></label>");
    panel.querySelector(".as-preset select").addEventListener("change", function (ev) {
      var v = ev.target.value; if (v === "") return;
      var fresh = defaults();
      fresh.metric = state.metric; fresh.stdz = state.stdz;            // scenarios keep the effect-size display...
      if (v !== "reset") {
        var p = PRESETS[Number(v)];
        TOGGLES.forEach(function (t) { fresh.on[t] = false; });
        for (var k in p.set) fresh[k] = p.set[k];
        for (var t in p.on) fresh.on[t] = !!p.on[t];
        for (var a in (p.an || {})) fresh[a] = p.an[a];               // ...and reset the analysis unless the scenario sets it
      }
      ["n", "delta", "sd", "rho"].forEach(function (k) { fresh[k] = state[k]; });
      if (v !== "reset" && PRESETS[Number(v)].set.trend !== undefined) fresh.trend = PRESETS[Number(v)].set.trend;
      state = fresh; syncPanel(); ev.target.value = v; changed();
    });
    GROUPS.forEach(function (grp) {
      var gd = document.createElement("div"); gd.className = "as-group";
      var head = '<div class="as-group-head"><span class="as-key">' + grp.title + "</span>";
      if (grp.toggle) head += '<label class="as-switch"><span></span><input type="checkbox" aria-label="' + grp.title + '"></label>';
      gd.innerHTML = head + "</div>";
      if (grp.toggle) {
        gd.dataset.toggle = grp.toggle;
        gd.querySelector(".as-switch input").addEventListener("change", function (ev) { state.on[grp.toggle] = ev.target.checked; syncPanel(); markCustom(); changed(); });
      }
      grp.items.forEach(function (c) { gd.appendChild(field(c)); });
      panel.appendChild(gd);
    });
    syncPanel();
  }
  function markCustom() { panel.querySelector(".as-preset select").value = ""; }
  function syncPanel() {
    ITEMS.forEach(function (c) {
      var f = panel.querySelector('.as-field[data-id="' + c.id + '"]');
      if (c.type === "radio") f.querySelectorAll("input").forEach(function (i) { i.checked = i.value === state[c.id]; });
      else if (c.type === "select") f.querySelector("select").value = state[c.id];
      else { f.querySelector("input").value = state[c.id]; f.querySelector(".as-val").textContent = fmtVal(c, state[c.id]); }
      f.hidden = c.show ? !c.show(state) : false;
    });
    panel.querySelectorAll(".as-group[data-toggle]").forEach(function (g) {
      var on = !!state.on[g.dataset.toggle];
      g.querySelector(".as-switch input").checked = on;
      g.querySelector(".as-switch span").textContent = on ? "On" : "Off";
      g.classList.toggle("is-off", !on);
      g.querySelectorAll(".as-field input, .as-field select").forEach(function (i) { i.disabled = !on; });
    });
  }
  // draw the sample now; recompute the expected values (heavier) shortly after
  var heavy = null, hashTimer = null;
  function changed() {
    render();
    clearTimeout(heavy);
    heavy = setTimeout(function () { if (!breakdown || breakdown.sig !== sigOf(false)) { computeBreakdown(); render(); } }, 160);
    clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 250);
  }

  // ---- wiring
  readHash();
  buildPanel();
  app.querySelectorAll(".as-view input").forEach(function (i) {
    i.checked = i.value === view;
    i.addEventListener("change", function () { view = i.value; changed(); });
  });
  app.querySelector(".as-seed").addEventListener("click", function () { seed = Math.floor(Math.random() * 4294967295) >>> 0; changed(); });
  app.querySelector(".as-png").addEventListener("click", downloadPng);
  app.querySelector(".as-svg").addEventListener("click", function () { download(new Blob([exportSvg()], { type: "image/svg+xml" }), fileName("svg")); });
  var copyBtn = app.querySelector(".as-copy");
  copyBtn.addEventListener("click", function () {
    writeHash();
    var url = location.href, done = function () { copyBtn.textContent = "Link copied"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1600); };
    function fallback() { var t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ } t.remove(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
  });
  var rt = null;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(render, 120); });
  computeBreakdown();
  render();
})();
