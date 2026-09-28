/* Artifact Simulator, "Odds & risk ratios" tab: how exposure and outcome
   misclassification and selective participation bias odds ratios and risk
   ratios. No dependencies. Markup: artifact-simulator.qmd (#rs-app).
   Styles: simulator.css (.rs-*). URL keys are prefixed "q." so they don't
   clash with the r and d tabs (simulator.js). Sections:
     1. controls, presets     4. corrections
     2. the model (exact)     5. rendering (tables, replications, bias breakdown)
     3. random samples        6. export, URL state, wiring              */
(function () {
  "use strict";
  var app = document.getElementById("rs-app");
  if (!app) return;
  var NS = "http://www.w3.org/2000/svg";

  // ======================================================= 1. controls
  var GROUPS = [
    { title: "Effect", items: [
      { id: "n", info: "Number of people in the study population, before anyone drops out.", label: "Sample size", min: 200, max: 5000, step: 100, val: 1000, dp: 0 },
      { id: "r0", info: "Probability of the outcome among the truly unexposed. When the outcome is rare, odds ratios and risk ratios are similar and false positives do more damage.", label: "Baseline risk (unexposed)", min: 0.01, max: 0.5, step: 0.01, val: 0.1 },
      { id: "pE", info: "Share of people who are truly exposed.", label: "Exposure prevalence", min: 0.05, max: 0.95, step: 0.05, val: 0.3 },
      { id: "eff", info: "The true ratio comparing the exposed with the unexposed, free of every artifact. 1 means no effect.", label: "True ratio", type: "log", min: 0.25, max: 4, val: 2 }] },
    { title: "Exposure misclassification", toggle: "exm", items: [
      { id: "seE", info: "Probability that a truly exposed person is recorded as exposed.", label: "Sensitivity", min: 0.5, max: 1, step: 0.01, val: 0.8 },
      { id: "spE", info: "Probability that a truly unexposed person is recorded as unexposed.", label: "Specificity", min: 0.5, max: 1, step: 0.01, val: 0.9 },
      { id: "rb", info: "Added to the exposure sensitivity for people with the outcome only, as when cases recall past exposures more completely. This makes the misclassification differential.", label: "Recall bias", min: 0, max: 0.3, step: 0.01, val: 0 }] },
    { title: "Outcome misclassification", toggle: "oum", items: [
      { id: "seD", info: "Probability that a person with the outcome is recorded as having it.", label: "Sensitivity", min: 0.5, max: 1, step: 0.01, val: 0.9 },
      { id: "spD", info: "Probability that a person without the outcome is recorded as not having it. Even small drops matter when the outcome is rare.", label: "Specificity", min: 0.8, max: 1, step: 0.005, val: 0.98, dp: 3 },
      { id: "db", info: "Added to the outcome sensitivity for exposed people only, as when the exposed are tested or followed more closely.", label: "Detection bias", min: 0, max: 0.3, step: 0.01, val: 0 }] },
    { title: "Selection (who takes part)", toggle: "sel", items: [
      { id: "s11", info: "Probability that an exposed person with the outcome takes part in the study.", label: "Exposed, with outcome", min: 0.05, max: 1, step: 0.05, val: 0.5 },
      { id: "s10", info: "Probability that an exposed person without the outcome takes part in the study.", label: "Exposed, no outcome", min: 0.05, max: 1, step: 0.05, val: 0.8 },
      { id: "s01", info: "Probability that an unexposed person with the outcome takes part in the study.", label: "Unexposed, with outcome", min: 0.05, max: 1, step: 0.05, val: 0.8 },
      { id: "s00", info: "Probability that an unexposed person without the outcome takes part in the study.", label: "Unexposed, no outcome", min: 0.05, max: 1, step: 0.05, val: 0.8 }] }
  ];
  var TOGGLES = ["exm", "oum", "sel"], DEFAULT_ON = { exm: true, oum: false, sel: false };
  var ORDER = [{ t: "exm", label: "+ Exposure misclassification" }, { t: "oum", label: "+ Outcome misclassification" }, { t: "sel", label: "+ Selection" }];
  var PRESETS = [
    { name: "Nondifferential exposure misclassification", set: { seE: 0.8, spE: 0.9, rb: 0 }, on: { exm: 1 } },
    { name: "Recall bias", set: { seE: 0.75, spE: 0.95, rb: 0.2 }, on: { exm: 1 } },
    { name: "Outcome: imperfect sensitivity", set: { seD: 0.7, spD: 1, db: 0 }, on: { oum: 1 } },
    { name: "Outcome: imperfect specificity", set: { r0: 0.05, seD: 1, spD: 0.95, db: 0 }, on: { oum: 1 } },
    { name: "Detection bias", set: { seD: 0.6, spD: 0.99, db: 0.3 }, on: { oum: 1 } },
    { name: "Case-control sampling", set: { s11: 1, s01: 1, s10: 0.1, s00: 0.1 }, on: { sel: 1 } },
    { name: "Differential participation", set: { s11: 0.5, s10: 0.8, s01: 0.8, s00: 0.8 }, on: { sel: 1 } },
    { name: "Everything at once", set: { seE: 0.85, spE: 0.9, rb: 0.05, seD: 0.9, spD: 0.99, db: 0, s11: 0.7, s10: 0.8, s01: 0.8, s00: 0.8 }, on: { exm: 1, oum: 1, sel: 1 } }
  ];
  var ITEMS = []; GROUPS.forEach(function (g) { ITEMS = ITEMS.concat(g.items); });
  function defaults() {
    var s = { on: {} };
    ITEMS.forEach(function (c) { s[c.id] = c.val; });
    TOGGLES.forEach(function (t) { s.on[t] = DEFAULT_ON[t]; });
    return s;
  }
  // meas: which ratio the numbers, slider, and replications use ("or" or "rr")
  var state = defaults(), meas = "or", view = "sample", seed = 20240501, active = false;

  // ============================================== 2. the model (exact)
  // Cells are indexed e*2 + d, with the usual 2 x 2 letters: 3 = exposed/outcome (a),
  // 2 = exposed/no outcome (b), 1 = unexposed/outcome (c), 0 = unexposed/no outcome (d).
  function risks(s) {
    var R0 = s.r0, R1 = meas === "rr" ? s.eff * R0 : s.eff * R0 / (1 - R0 + s.eff * R0);
    return [R0, Math.min(0.999, R1)];
  }
  function ratios(p) {
    return { or: (p[3] * p[0]) / (p[2] * p[1]), rr: (p[3] / (p[3] + p[2])) / (p[1] / (p[1] + p[0])) };
  }
  // P(recorded cell | true cell); exposure and outcome errors are independent
  function classify(s, on) {
    var M = [];
    for (var o = 0; o < 4; o++) {
      M.push([]);
      var oe = o >> 1, od = o & 1;
      for (var c = 0; c < 4; c++) {
        var e = c >> 1, d = c & 1, pe, pd;
        if (on.exm) { var se = Math.min(1, s.seE + (d ? s.rb : 0)); pe = e ? (oe ? se : 1 - se) : (oe ? 1 - s.spE : s.spE); }
        else pe = oe === e ? 1 : 0;
        if (on.oum) { var sd = Math.min(1, s.seD + (e ? s.db : 0)); pd = d ? (od ? sd : 1 - sd) : (od ? 1 - s.spD : s.spD); }
        else pd = od === d ? 1 : 0;
        M[o].push(pe * pd);
      }
    }
    return M;
  }
  function model(s, on) {
    var R = risks(s), T = [(1 - s.pE) * (1 - R[0]), (1 - s.pE) * R[0], s.pE * (1 - R[1]), s.pE * R[1]];
    var S = on.sel ? [s.s00, s.s01, s.s10, s.s11] : [1, 1, 1, 1];
    var M = classify(s, on), O = [0, 0, 0, 0];
    for (var o = 0; o < 4; o++) for (var i = 0; i < 4; i++) O[o] += M[o][i] * T[i] * S[i];
    return { T: T, S: S, M: M, O: O };
  }
  function truth(s) { return ratios(model(s, {}).T); }
  function expected(s) { return ratios(model(s, s.on).O); }

  // ==================================================== 3. random samples
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // one draw per person over (true cell) x (not analyzed, or recorded cell)
  function categories(m) {
    var cats = [], cum = 0;
    for (var c = 0; c < 4; c++) {
      cum += m.T[c] * (1 - m.S[c]); cats.push({ c: c, o: -1, cum: cum });
      for (var o = 0; o < 4; o++) { cum += m.T[c] * m.S[c] * m.M[o][c]; cats.push({ c: c, o: o, cum: cum }); }
    }
    cats[cats.length - 1].cum = Infinity;
    return cats;
  }
  function drawSample(cats, n, rng) {
    var tr = [0, 0, 0, 0], ob = [0, 0, 0, 0];
    for (var i = 0; i < n; i++) {
      var u = rng(), j = 0;
      while (u > cats[j].cum) j++;
      tr[cats[j].c]++;
      if (cats[j].o >= 0) ob[cats[j].o]++;
    }
    return { tr: tr, ob: ob };
  }
  // estimates with 0.5 added to every cell when one is empty; Wald CIs on the log scale
  function estimate(ob) {
    var a = ob.slice();
    if (a.some(function (x) { return x === 0; })) a = a.map(function (x) { return x + 0.5; });
    var r = ratios(a);
    var seOR = Math.sqrt(1 / a[0] + 1 / a[1] + 1 / a[2] + 1 / a[3]);
    var seRR = Math.sqrt(1 / a[3] - 1 / (a[3] + a[2]) + 1 / a[1] - 1 / (a[1] + a[0]));
    return { or: r.or, rr: r.rr,
      ci: { or: [r.or * Math.exp(-1.96 * seOR), r.or * Math.exp(1.96 * seOR)], rr: [r.rr * Math.exp(-1.96 * seRR), r.rr * Math.exp(1.96 * seRR)] } };
  }

  // ======================================================= 4. corrections
  // Undo the artifacts with the known bias parameters: invert the
  // classification probabilities (matrix method), then weight each cell by
  // 1 / participation.
  function solve(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      var t = M[i]; M[i] = M[p]; M[p] = t;
      for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var sum = M[i][n]; for (j = i + 1; j < n; j++) sum -= M[i][j] * x[j]; x[i] = sum / M[i][i]; }
    return x;
  }
  function correct(ob, s) {
    var on = s.on, t = ob.slice(), m = model(s, on);
    if (on.exm || on.oum) { t = solve(m.M, t); if (!t) return { or: NaN, rr: NaN }; }
    if (t.some(function (x) { return !(x > 0); })) return { or: NaN, rr: NaN };
    if (on.sel) t = t.map(function (x, i) { return x / m.S[i]; });
    return ratios(t);
  }

  // ======================================================= 5. rendering
  function f2(x) { return isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(2)) : "—"; }
  function esc(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  var MEAS = { or: "OR", rr: "RR" };
  var el = { stats: app.querySelector(".as-stats"), svg: app.querySelector(".as-plot"), legend: app.querySelector(".as-legend"), budget: app.querySelector(".as-budget") };
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
  var last = "";

  // One 2 x 2 table drawn in SVG. Rows: exposed / unexposed; columns: outcome /
  // no outcome. Outcome column (a, c) cyan, no-outcome column (b, d) magenta;
  // shading = row percentage.
  // c: cell values (population probabilities, or sample counts when showCounts);
  // each cell shows its share of the whole table, plus (count) for a sample
  function table(x0, y0, w, title, sub, c, showCounts) {
    var total = c[0] + c[1] + c[2] + c[3], maxp = Math.max(c[0], c[1], c[2], c[3]) / (total || 1);
    // hw: row-label column, xw: risk or odds column on the right
    var hw = w < 330 ? 78 : 96, xw = w < 330 ? 58 : 70, cw = (w - hw - xw) / 2, hh = 26, ch = w < 330 ? 68 : 76, h = "";
    h += '<text class="rs-t-title" x="' + x0 + '" y="' + (y0 + 12) + '">' + esc(title) + "</text>";
    h += '<text class="rs-t-sub" x="' + x0 + '" y="' + (y0 + 30) + '">' + esc(sub) + "</text>";
    var top = y0 + 44;
    ["Outcome", "No outcome"].forEach(function (lab, j) {
      h += '<text class="rs-t-head" x="' + (x0 + hw + cw * j + cw / 2) + '" y="' + (top + 17) + '" text-anchor="middle">' + lab + "</text>";
    });
    h += '<text class="rs-t-head" x="' + (x0 + hw + 2 * cw + xw / 2) + '" y="' + (top + 17) + '" text-anchor="middle">' + (meas === "or" ? "Odds" : "Risk") + "</text>";
    // rows top to bottom: exposed (a, b), unexposed (c, d)
    [[3, 2, "Exposed"], [1, 0, "Unexposed"]].forEach(function (row, i) {
      var y = top + hh + i * ch, tot = c[row[0]] + c[row[1]];
      h += '<text class="rs-t-head" x="' + (x0 + hw - 10) + '" y="' + (y + ch / 2 + 4) + '" text-anchor="end">' + row[2] + "</text>";
      [row[0], row[1]].forEach(function (k, j) {
        var rate = total > 0 ? c[k] / total : 0, good = j === 0;   // j = 0 is the outcome column
        var op = 0.1 + 0.85 * (maxp > 0 ? rate / maxp : 0), x = x0 + hw + j * cw, ink = op > 0.55 ? " rs-ink" : "";
        var lab = { 3: "a", 2: "b", 1: "c", 0: "d" }[k];
        h += '<rect class="' + (good ? "rs-cell-t" : "rs-cell-f") + '" x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" fill-opacity="' + op.toFixed(3) + '"/>';
        h += '<text class="rs-cell-lab' + ink + '" x="' + (x + 8) + '" y="' + (y + 16) + '">' + lab + "</text>";
        h += '<text class="rs-cell-n' + ink + '" x="' + (x + cw / 2) + '" y="' + (y + ch / 2 + (showCounts ? 6 : 12)) + '" text-anchor="middle">' + rate.toFixed(3) + "</text>";
        if (showCounts) h += '<text class="rs-cell-p' + ink + '" x="' + (x + cw / 2) + '" y="' + (y + ch / 2 + 24) + '" text-anchor="middle">(' + Math.round(c[k]).toLocaleString() + ")</text>";
      });
      // risk (outcome / row total) or odds (outcome / no outcome) for this row
      var num = c[row[0]], den = meas === "or" ? c[row[1]] : tot, v = den > 0 ? num / den : NaN;
      var fx = x0 + hw + 2 * cw + xw / 2, L = i === 0 ? ["a", "b"] : ["c", "d"];
      h += '<text class="rs-side" x="' + fx + '" y="' + (y + ch / 2 + 6) + '" text-anchor="middle">' + (isFinite(v) ? v.toFixed(3) : "—") + "</text>";
    });
    var r = ratios(c.some(function (v) { return v === 0; }) ? c.map(function (v) { return v + 0.5; }) : c);
    var by = top + hh + 2 * ch + 24;
    h += '<text class="rs-t-foot" x="' + (x0 + hw) + '" y="' + by + '"><tspan class="rs-on">' + MEAS[meas] + " " + f2(r[meas]) + "</tspan></text>";
    return { svg: h, height: by - y0 + 8 };
  }

  function renderSample() {
    sizePlot(H);
    var s = state, m = model(s, s.on), smp = drawSample(categories(m), s.n, mulberry32(seed));
    var est = estimate(smp.ob), cor = correct(smp.ob, s), tru = truth(s), ex = ratios(m.O), k = meas, K = MEAS[k];
    var nAn = smp.ob[0] + smp.ob[1] + smp.ob[2] + smp.ob[3];
    tiles([["Observed " + K, f2(est[k]), "as-lead", "95% CI " + f2(est.ci[k][0]) + "–" + f2(est.ci[k][1])], ["Corrected " + K, f2(cor[k])],
      ["Expected " + K, f2(ex[k])], ["True " + K, f2(tru[k])]]);
    last = "Observed " + K + " = " + f2(est[k]) + " · Corrected = " + f2(cor[k]) + " · Expected = " + f2(ex[k]) + " · True = " + f2(tru[k]);
    var stack = W < 600, gap = 32, tw = stack ? W : (W - gap) / 2;
    var a = table(0, 0, tw, "True", "Population", m.T, false);
    var b = table(stack ? 0 : tw + gap, stack ? a.height + 20 : 0, tw, "Observed", "n = " + nAn, smp.ob, true);
    sizePlot(stack ? a.height * 2 + 20 : a.height);
    svg.innerHTML = a.svg + b.svg;
    legend([["", "Each cell is its share of the whole table" + " (count in parentheses for the observed sample); brighter cells hold a larger share."]]);
  }

  // ---- replications
  var REPS = 1000, repl = null, replToken = 0, replTimer = null, running = null;
  function sigOf() { var o = {}; ITEMS.forEach(function (c) { o[c.id] = state[c.id]; }); o.on = state.on; o.m = meas; return JSON.stringify(o) + "|" + seed; }
  function status(msg) { svg.innerHTML = '<text class="as-status" x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">' + esc(msg) + "</text>"; }
  function runRepl() {
    var token = ++replToken, s = state, sig = sigOf(), cats = categories(model(s, s.on)), k = meas, tr = truth(s)[k];
    var rng = mulberry32((seed ^ 0x5bd1e995) >>> 0), obs = [], cor = [], cover = 0;
    running = sig;
    (function chunk() {
      if (token !== replToken) return;
      for (var i = 0; i < 50 && obs.length < REPS; i++) {
        var smp = drawSample(cats, s.n, rng), e = estimate(smp.ob);
        obs.push(e[k]); cor.push(correct(smp.ob, s)[k]);
        if (e.ci[k][0] <= tr && tr <= e.ci[k][1]) cover++;
      }
      if (obs.length < REPS) { if (view === "repl" && active) status("Running " + obs.length + " / " + REPS + " replications…"); setTimeout(chunk, 0); }
      else { running = null; repl = { sig: sig, obs: obs, cor: cor, cover: cover / REPS }; if (view === "repl" && active) render(); }
    })();
  }
  function gmean(v) { var s = 0; v.forEach(function (x) { s += Math.log(x); }); return Math.exp(s / v.length); }
  function logTicks(lo, hi) {
    var t = [0.01, 0.03, 0.06, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128].filter(function (v) { return v >= lo && v <= hi; });
    return t.length > 8 ? t.filter(function (v, i) { return v === 1 || i % 2 === 0; }) : t;
  }
  function renderRepl() {
    var s = state, k = meas, K = MEAS[k], tru = truth(s)[k], ex = expected(s)[k];
    sizePlot(H);
    sizePlot(W < 520 ? Math.round(W * 0.9) : Math.round(W * 0.62));
    if (!repl || repl.sig !== sigOf()) {
      status("Running " + REPS + " replications…");
      tiles([["Typical observed " + K, "…", "is-stale"], ["Typical corrected " + K, "…", "is-stale"], ["True " + K, f2(tru)], ["CI coverage", "…", "is-stale"]]);
      if (running !== sigOf()) { clearTimeout(replTimer); replTimer = setTimeout(runRepl, 150); }
      el.legend.innerHTML = "";
      return;
    }
    var ob = repl.obs.filter(function (v) { return v > 0 && isFinite(v); }), cr = repl.cor.filter(function (v) { return v > 0 && isFinite(v); });
    var dropped = repl.cor.length - cr.length;
    tiles([["Typical observed " + K, f2(gmean(ob)), "as-lead", "geometric mean of " + REPS], ["Typical corrected " + K, f2(gmean(cr))], ["True " + K, f2(tru)],
      ["CI coverage", Math.round(repl.cover * 100) + "%", "", "observed 95% CIs that contain the truth"]]);
    last = REPS + " replications, n = " + s.n + " · typical observed " + K + " = " + f2(gmean(ob)) + " · corrected = " + f2(gmean(cr)) + " · true = " + f2(tru) + " · CI coverage " + Math.round(repl.cover * 100) + "%";
    var lg = Math.log, L = ob.map(lg).concat(cr.map(lg), [lg(tru), lg(ex), 0]);
    L.sort(function (a, b) { return a - b; });
    var lo = L[Math.floor(L.length * 0.002)], hi = L[Math.ceil(L.length * 0.998) - 1], pad = (hi - lo) * 0.06 || 0.1;
    lo = Math.min(lo, lg(tru), lg(ex), 0) - pad; hi = Math.max(hi, lg(tru), lg(ex), 0) + pad;
    var ml = W < 520 ? 44 : 54, mr = 12, nb = W < 520 ? 30 : 44, bw = (hi - lo) / nb;
    var bins = function (v) { var h = new Array(nb).fill(0); v.forEach(function (x) { var i = Math.floor((lg(x) - lo) / bw); if (i >= 0 && i < nb) h[i]++; }); return h; };
    var hO = bins(ob), hC = bins(cr), top = Math.max(Math.max.apply(null, hO), Math.max.apply(null, hC)), yMax = Math.ceil(top * 1.12 / 10) * 10 || 10;
    var bt = H - 48, sx = function (l) { return ml + (l - lo) / (hi - lo) * (W - ml - mr); }, sy = function (c) { return bt - c / yMax * (bt - 14); };
    var h = "", i, yStep = yMax <= 50 ? 10 : yMax <= 100 ? 20 : yMax <= 250 ? 50 : 100;
    for (var u = 0; u <= yMax; u += yStep) h += '<line class="as-grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + sy(u) + '" y2="' + sy(u) + '"/><text x="' + (ml - 8) + '" y="' + (sy(u) + 4) + '" text-anchor="end">' + u + "</text>";
    logTicks(Math.exp(lo), Math.exp(hi)).forEach(function (t) { h += '<text x="' + sx(lg(t)) + '" y="' + (bt + 18) + '" text-anchor="middle">' + t + "</text>"; });
    h += '<rect class="as-frame" x="' + ml + '" y="14" width="' + (W - ml - mr) + '" height="' + (bt - 14) + '"/>';
    h += '<text class="as-axis-title" x="' + ((ml + W - mr) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + (k === "or" ? "Odds" : "Risk") + " ratio across " + REPS + " samples (log scale)</text>";
    h += '<text class="as-axis-title" transform="translate(15,' + ((14 + bt) / 2) + ') rotate(-90)" text-anchor="middle">Count</text>';
    for (i = 0; i < nb; i++) if (hO[i]) h += '<rect class="as-hist-obs" x="' + (sx(lo + i * bw) + 0.5) + '" y="' + sy(hO[i]) + '" width="' + Math.max(0.5, sx(lo + bw) - sx(lo) - 1) + '" height="' + (bt - sy(hO[i])) + '"/>';
    var p = "M" + sx(lo) + "," + bt;
    for (i = 0; i < nb; i++) p += "L" + sx(lo + i * bw) + "," + sy(hC[i]) + "L" + sx(lo + (i + 1) * bw) + "," + sy(hC[i]);
    h += '<path class="as-hist-cor" d="' + p + "L" + sx(hi) + "," + bt + '"/>';
    h += '<line class="as-zero" x1="' + sx(0) + '" x2="' + sx(0) + '" y1="14" y2="' + bt + '"/>';
    function vline(v, cls, label, dy) {
      var x = sx(lg(v)), right = x > W * 0.7;
      return '<line class="' + cls + '" x1="' + x + '" x2="' + x + '" y1="14" y2="' + bt + '"/><text class="as-vl-label" x="' + (x + (right ? -6 : 6)) + '" y="' + (30 + dy) + '" text-anchor="' + (right ? "end" : "start") + '">' + label + "</text>";
    }
    h += vline(tru, "as-vl-true", "True " + f2(tru), 0) + vline(ex, "as-vl-exp", "Expected " + f2(ex), 18);
    svg.innerHTML = h;
    var items = [['<rect class="as-hist-obs" x="-7" y="-7" width="14" height="14"/>', "Observed"], ['<path class="as-hist-cor" d="M-7,6L-7,-4L0,-4L0,1L7,1L7,6"/>', "Corrected"],
      ['<line class="as-vl-true" x1="0" x2="0" y1="-7" y2="7"/>', "True value"], ['<line class="as-vl-exp" x1="0" x2="0" y1="-7" y2="7"/>', "Expected"]];
    if (dropped) items.push(["", dropped + " corrected estimates could not be computed (negative back-calculated cells) and are not shown"]);
    legend(items);
  }

  // ---- bias breakdown: add the active artifacts one at a time (exact values),
  // laid out like the r and d tabs: Step | Expected OR or RR | Change
  function renderBudget() {
    var s = state, on = {}, K = MEAS[meas], tr = truth(s)[meas], rows = [{ label: meas === "or" ? "True odds ratio" : "True risk ratio", v: tr }];
    ORDER.forEach(function (st) { if (!s.on[st.t]) return; on[st.t] = 1; rows.push({ label: st.label, v: ratios(model(s, on).O)[meas] }); });
    // bars: distance from 1 (no effect) on the log scale, relative to the true value
    var bar = function (v) { var lt = Math.log(tr); return Math.abs(lt) > 1e-9 && isFinite(v) ? Math.max(0, Math.min(100, Math.log(v) / lt * 100)) : 0; };
    var html = "", prev = tr, fin = rows[rows.length - 1].v;
    rows.forEach(function (r, i) {
      var ch = i === 0 ? "" : (r.v - prev >= 0 ? "+" : "−") + Math.abs(r.v - prev).toFixed(2);
      html += "<tr><td>" + esc(r.label) + '<div class="as-bar"><i style="width:' + bar(r.v).toFixed(1) + '%"></i></div></td><td class="as-num">' + f2(r.v) +
        '</td><td class="as-num as-loss">' + ch + "</td></tr>";
      prev = r.v;
    });
    el.budget.innerHTML = '<div class="as-key">Bias breakdown</div><table><thead><tr><th class="as-key">Step</th><th class="as-key as-num">Expected ' + K +
      '</th><th class="as-key as-num">Change</th></tr></thead><tbody>' + html +
      "</tbody><tfoot><tr><td>" + (Math.abs(Math.log(fin)) < Math.abs(Math.log(tr)) ? "Total bias toward 1" : "Total bias away from 1") + '</td><td class="as-num">' + f2(fin) +
      '</td><td class="as-num as-loss">' + (fin - tr >= 0 ? "+" : "−") + Math.abs(fin - tr).toFixed(2) + "</td></tr></tfoot></table>" +
      '<p class="as-note">Artifacts are added one at a time, in the order of the controls. <em>Expected</em> is exact: what a very large study would find. Switch an artifact off in the controls to remove it from the breakdown.</p>';
  }

  function render() {
    if (view === "repl") renderRepl(); else renderSample();
    renderBudget();
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
  function fileName(ext) { return "artifact-simulator-" + (meas === "or" ? "odds-ratio" : "risk-ratio") + "-" + (view === "repl" ? "replications" : "tables") + "." + ext; }
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
    if (!active) return;
    var d = defaults(), parts = ["t=ratio", "q.m=" + meas];
    if (view !== "sample") parts.push("q.v=" + view);
    parts.push("q.s=" + seed);
    ITEMS.forEach(function (c) { if (state[c.id] !== d[c.id]) parts.push("q." + c.id + "=" + state[c.id]); });
    TOGGLES.forEach(function (t) { if (state.on[t] !== d.on[t]) parts.push("q.on." + t + "=" + (state.on[t] ? 1 : 0)); });
    try { history.replaceState(null, "", "#" + parts.join("&")); } catch (e) { /* ignore */ }
  }
  function readHash() {
    (location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
      var p = kv.split("="), k = decodeURIComponent(p[0] || ""), v = decodeURIComponent(p[1] || "");
      if (k.slice(0, 2) !== "q.") return;
      k = k.slice(2);
      if (k === "m") { if (v === "or" || v === "rr") meas = v; }
      else if (k === "v") { if (v === "repl" || v === "sample") view = v; }
      else if (k === "s") { if (/^\d+$/.test(v)) seed = Number(v) >>> 0; }
      else if (/^on\./.test(k)) { var t = k.slice(3); if (TOGGLES.indexOf(t) >= 0) state.on[t] = v === "1"; }
      else {
        var c = ITEMS.filter(function (x) { return x.id === k; })[0], num = Number(v);
        if (c && isFinite(num)) state[k] = Math.min(c.max, Math.max(c.min, num));
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
  function fmtVal(c, v) { return Number(v).toFixed(c.dp === undefined ? 2 : c.dp); }
  function log2(v) { return Math.log(v) / Math.LN2; }
  var panel = app.querySelector(".as-panel");
  function buildPanel() {
    // top of the panel: which ratio, then the scenario menu
    panel.insertAdjacentHTML("beforeend",
      '<div class="rs-measure as-field"><div class="as-field-head"><span class="as-lab"><span class="as-key">Effect measure</span>' +
      infoTip({ label: "Effect measure", info: "Which ratio the tables, headline numbers, true-value slider, bias breakdown, and replications use." }, "rs-meas") +
      '</span></div><div class="as-seg" role="radiogroup" aria-label="Effect measure">' +
      '<label><input type="radio" name="rs-meas" value="or">Odds ratio</label><label><input type="radio" name="rs-meas" value="rr">Risk ratio</label></div></div>' +
      '<label class="as-preset"><span class="as-key">Scenario</span><select><option value="">Custom settings</option><option value="reset">Default settings</option>' +
      PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + "</option>"; }).join("") + "</select></label>");
    panel.querySelectorAll(".rs-measure input").forEach(function (i) {
      i.addEventListener("change", function () { setMeasure(i.value); changed(); });
    });
    panel.querySelector("select").addEventListener("change", function (ev) {
      var v = ev.target.value; if (v === "") return;
      var fresh = defaults();
      if (v !== "reset") {
        var p = PRESETS[Number(v)];
        TOGGLES.forEach(function (t) { fresh.on[t] = false; });
        for (var k in p.set) fresh[k] = p.set[k];
        for (var t in p.on) fresh.on[t] = !!p.on[t];
      }
      fresh.n = state.n; fresh.eff = state.eff;
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
      grp.items.forEach(function (c) {
        var f = document.createElement("div"), uid = "rs-" + c.id, log = c.type === "log";
        f.className = "as-field"; f.dataset.id = c.id;
        f.innerHTML = '<div class="as-field-head"><span class="as-lab"><label for="' + uid + '">' + c.label + "</label>" + infoTip(c, uid) + '</span><span class="as-val"></span></div>' +
          '<input type="range" id="' + uid + '" min="' + (log ? log2(c.min) : c.min) + '" max="' + (log ? log2(c.max) : c.max) + '" step="' + (log ? 0.01 : c.step) + '">';
        f.querySelector("input").addEventListener("input", function (ev) {
          var x = Number(ev.target.value);
          state[c.id] = log ? Math.round(Math.pow(2, x) * 1000) / 1000 : x;
          f.querySelector(".as-val").textContent = fmtVal(c, state[c.id]);
          markCustom(); changed();
        });
        gd.appendChild(f);
      });
      panel.appendChild(gd);
    });
    syncPanel();
  }
  function markCustom() { panel.querySelector("select").value = ""; }
  function syncPanel() {
    panel.querySelectorAll(".rs-measure input").forEach(function (i) { i.checked = i.value === meas; });
    ITEMS.forEach(function (c) {
      var f = panel.querySelector('.as-field[data-id="' + c.id + '"]');
      f.querySelector("input").value = c.type === "log" ? log2(state[c.id]) : state[c.id];
      f.querySelector(".as-val").textContent = fmtVal(c, state[c.id]);
    });
    panel.querySelector('.as-field[data-id="eff"] label').textContent = meas === "or" ? "True odds ratio" : "True risk ratio";
    panel.querySelectorAll(".as-group[data-toggle]").forEach(function (g) {
      var on = !!state.on[g.dataset.toggle];
      g.querySelector(".as-switch input").checked = on;
      g.querySelector(".as-switch span").textContent = on ? "On" : "Off";
      g.classList.toggle("is-off", !on);
      g.querySelectorAll(".as-field input").forEach(function (i) { i.disabled = !on; });
    });
  }
  // switching measures converts the true value so the underlying risks stay the same
  function setMeasure(m) {
    if (m === meas) return;
    var R = risks(state), v = m === "rr" ? R[1] / R[0] : R[1] * (1 - R[0]) / (R[0] * (1 - R[1]));
    state.eff = Math.round(Math.min(4, Math.max(0.25, v)) * 100) / 100;
    meas = m;
    syncPanel();
  }
  var hashTimer = null;
  function changed() { render(); clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 250); }

  // ---- wiring
  readHash();
  buildPanel();
  // the page-level tab bar (artifact-simulator.qmd) announces tab changes
  document.addEventListener("sim:tab", function (ev) {
    active = ev.detail === "ratio";
    if (active) changed();
  });
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
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (active) render(); }, 120); });
  render();
})();
