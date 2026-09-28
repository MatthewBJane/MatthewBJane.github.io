/* POSC Simulator: probability of outcome superiority curves (Jané, posc R
   package). No dependencies. Markup: posc-simulator.qmd (#po-app). Styles:
   artifact-simulator/simulator.css (shared, plus .po-* rules).

   For a bivariate normal predictor X and outcome Y with correlation r, the
   probability that person A has the higher outcome, given that A scores Δ
   SDs higher on X than person B, is  Φ( r·Δ / √(2(1 − r²)) ).
   CIs use the Fisher-z interval for r, as in the package. Sections:
     1. controls   2. math   3. rendering   4. export, URL, wiring */
(function () {
  "use strict";
  var app = document.getElementById("po-app");
  if (!app) return;
  var NS = "http://www.w3.org/2000/svg";

  // ======================================================= 1. controls
  var GROUPS = [
    { title: "Predictor", items: [
      { id: "mode", label: "Predictor", type: "radio", options: [["one", "One variable"], ["comp", "Composite of two"]], val: "one",
        info: "One variable: give its correlation with the outcome. Composite of two: the two predictors are combined with regression weights (as in posc_multi), and the curve uses the composite's correlation with the outcome." },
      { id: "r", label: "Correlation with the outcome (r)", min: -0.95, max: 0.95, step: 0.01, val: 0.5, show: function (s) { return s.mode === "one"; },
        info: "The correlation between the predictor and the outcome. Negative correlations give the probability of a lower outcome." },
      { id: "r1y", label: "r(X₁, outcome)", min: -0.9, max: 0.9, step: 0.01, val: 0.5, show: function (s) { return s.mode === "comp"; }, info: "Correlation between the first predictor and the outcome." },
      { id: "r2y", label: "r(X₂, outcome)", min: -0.9, max: 0.9, step: 0.01, val: 0.3, show: function (s) { return s.mode === "comp"; }, info: "Correlation between the second predictor and the outcome." },
      { id: "r12", label: "r(X₁, X₂)", min: -0.9, max: 0.9, step: 0.01, val: 0.3, show: function (s) { return s.mode === "comp"; }, info: "Correlation between the two predictors. Overlapping predictors add less to each other." },
      { id: "n", label: "Sample size", min: 10, max: 2000, step: 10, val: 100, dp: 0, info: "The sample the correlation comes from. It sets the width of the confidence band (Fisher-z interval)." },
      { id: "ci", label: "Confidence level", type: "select", val: "0.95", options: [["0.8", "80%"], ["0.9", "90%"], ["0.95", "95%"], ["0.99", "99%"]], info: "Coverage of the confidence band around the curve." }] },
    { title: "Labels and units", items: [
      { id: "xname", label: "Predictor name", type: "text", val: "X", info: "Used in the axis labels and the sentence under the plot, e.g. Cognitive ability." },
      { id: "yname", label: "Outcome name", type: "text", val: "Y", info: "Used in the axis labels and the sentence under the plot, e.g. Job performance." },
      { id: "sdx", label: "Predictor SD in raw units", type: "number", val: 1, min: 0.001, info: "Leave at 1 to show differences in standard deviations. Enter the predictor's SD (e.g. 15 for IQ) to show differences in raw units." }] },
    { title: "Compare with a second curve", toggle: "cmp", items: [
      { id: "r2", label: "Second correlation (r)", min: -0.95, max: 0.95, step: 0.01, val: 0.3, info: "The correlation for the comparison curve, e.g. another predictor or another study (as in posc_comp)." },
      { id: "n2", label: "Second sample size", min: 10, max: 2000, step: 10, val: 100, dp: 0, info: "Sample size behind the second correlation." },
      { id: "name2", label: "Second curve name", type: "text", val: "Comparison", info: "Label for the second curve in the legend and the table." }] }
  ];
  var TOGGLES = ["cmp"], DEFAULT_ON = { cmp: false };
  var ITEMS = []; GROUPS.forEach(function (g) { ITEMS = ITEMS.concat(g.items); });
  function defaults() { var s = { on: {}, dx: 1 }; ITEMS.forEach(function (c) { s[c.id] = c.val; }); TOGGLES.forEach(function (t) { s.on[t] = DEFAULT_ON[t]; }); return s; }
  var state = defaults();
  var XMAX = 4;   // curves run from 0 to 4 SDs of the predictor

  // ======================================================= 2. math
  function normCdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = Math.exp(-0.5 * x * x) / 2.5066282746310002;
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }
  function qnorm(p) {
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function posc(r, d) { r = Math.abs(r); return r >= 1 ? (d > 0 ? 1 : 0.5) : normCdf(r * d / Math.sqrt(2 * (1 - r * r))); }
  function rCI(r, n, lvl) {
    var z = qnorm(lvl + (1 - lvl) / 2), se = 1 / Math.sqrt(Math.max(1, n - 3)), a = Math.atanh(Math.abs(r));
    return [Math.max(0, Math.tanh(a - z * se)), Math.tanh(a + z * se)];      // on |r|, floored at 0 like the curve
  }
  // composite of two predictors with regression weights (posc_multi): returns its correlation with Y
  function composite(s) {
    var det = 1 - s.r12 * s.r12;
    if (det <= 1e-6) return { r: NaN, ok: false };
    var b1 = (s.r1y - s.r12 * s.r2y) / det, b2 = (s.r2y - s.r12 * s.r1y) / det;
    var R2 = b1 * s.r1y + b2 * s.r2y;
    // the three correlations must form a valid correlation matrix
    var ok = 1 - s.r1y * s.r1y - s.r2y * s.r2y - s.r12 * s.r12 + 2 * s.r1y * s.r2y * s.r12 > 0 && R2 < 1;
    var sw = b1 + b2, w1 = b1 / sw, w2 = b2 / sw;
    var r = (w1 * s.r1y + w2 * s.r2y) / Math.sqrt(w1 * w1 + w2 * w2 + 2 * w1 * w2 * s.r12);
    return { r: r, ok: ok, b1: b1, b2: b2 };
  }
  function mainR(s) { return s.mode === "one" ? { r: s.r, ok: true } : composite(s); }
  function overallPS(r) { return 0.5 + Math.asin(Math.abs(r)) / Math.PI; }         // P(concordant pair)
  function deltaFor(r, p) { r = Math.abs(r); return r > 0 ? qnorm(p) * Math.sqrt(2 * (1 - r * r)) / r : Infinity; }

  // ======================================================= 3. rendering
  function esc(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function pc(p) { return isFinite(p) ? (p * 100).toFixed(1) + "%" : "—"; }
  function f2(x) { return isFinite(x) ? x.toFixed(2) : "—"; }
  var el = { stats: app.querySelector(".as-stats"), svg: app.querySelector(".as-plot"), legend: app.querySelector(".as-legend"),
    sentence: app.querySelector(".po-sentence"), table: app.querySelector(".po-table") };
  var svg = el.svg, W = 640, H = 400, M = { l: 58, r: 16, t: 16, b: 50 };
  var last = "";
  // raw units only make sense for a single named predictor; a composite is in SD units
  function units(s) { var sd = s.mode === "one" ? Number(s.sdx) || 1 : 1; return { k: sd, raw: sd !== 1 }; }
  function xLabel(s) { return s.mode === "one" ? s.xname : "the composite predictor"; }
  function fmtD(s, d) { var u = units(s); return u.raw ? (+(d * u.k).toFixed(2)).toString() : d.toFixed(2) + " SD"; }
  function higherWord(r) { return r < 0 ? "lower" : "higher"; }

  function render() {
    var s = state, m = mainR(s), lvl = Number(s.ci), u = units(s);
    W = Math.round(Math.max(300, Math.min(760, svg.parentNode.clientWidth || 640)));
    H = Math.round(W < 520 ? W * 0.9 : W * 0.6);
    M = { l: W < 520 ? 48 : 58, r: 16, t: 16, b: 50 };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    if (!m.ok || !isFinite(m.r)) {
      svg.innerHTML = '<text class="as-status" x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle">These three correlations can’t occur together. Adjust r(X₁, X₂).</text>';
      el.stats.innerHTML = ""; el.sentence.innerHTML = ""; el.table.innerHTML = ""; el.legend.innerHTML = "";
      return;
    }
    var r = m.r, ci = rCI(r, s.n, lvl), d = s.dx, p = posc(r, d), pl = posc(ci[0], d), pu = posc(ci[1], d);
    var curves = [{ r: r, n: s.n, ci: ci, cls: "po-c1", name: s.mode === "one" ? s.xname : "Composite predictor" }];
    if (s.on.cmp) curves.push({ r: s.r2, n: s.n2, ci: rCI(s.r2, s.n2, lvl), cls: "po-c2", name: s.name2 });
    // tiles
    var d75 = deltaFor(r, 0.75), lvlTxt = Math.round(lvl * 100) + "% CI ";
    var t = [
      [s.mode === "one" ? "Correlation" : "Composite r", f2(r), "", lvlTxt + (r < 0 ? f2(-ci[1]) + " to " + f2(-ci[0]) : f2(ci[0]) + " to " + f2(ci[1]))],
      ["P(" + higherWord(r) + " " + s.yname + ") at Δ = " + fmtD(s, d), pc(p), "as-lead", lvlTxt + pc(pl) + " to " + pc(pu)],
      ["Overall probability of superiority", pc(overallPS(r)), "", "any two people, whatever their difference"],
      ["Difference for a 75% chance", isFinite(d75) && d75 <= 50 ? fmtD(s, d75) : "—", "", "in " + xLabel(s)]];
    if (s.on.cmp) {
      var z = (Math.atanh(r) - Math.atanh(s.r2)) / Math.sqrt(1 / (s.n - 3) + 1 / (s.n2 - 3)), pv = 2 * (1 - normCdf(Math.abs(z)));
      t.push(["Curves differ?", "z = " + f2(z), "", pv < 0.001 ? "p < .001" : "p = " + pv.toFixed(3).replace(/^0/, "")]);
    }
    el.stats.innerHTML = t.map(function (x) {
      return '<div class="as-stat"><div class="as-key">' + esc(x[0]) + '</div><div class="as-stat-val' + (x[2] ? " " + x[2] : "") + '">' + x[1] + '</div><div class="rs-sub">' + esc(x[3]) + "</div></div>";
    }).join("");
    // plot
    var bt = H - M.b, sx = function (v) { return M.l + v / XMAX * (W - M.l - M.r); }, sy = function (v) { return bt - (v - 0.5) / 0.5 * (bt - M.t); };
    var h = "", i;
    for (var g = 0.5; g <= 1.0001; g += 0.1) h += '<line class="as-grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + sy(g) + '" y2="' + sy(g) + '"/><text x="' + (M.l - 8) + '" y="' + (sy(g) + 4) + '" text-anchor="end">' + Math.round(g * 100) + "%</text>";
    for (var xv = 0; xv <= XMAX; xv += 1) h += '<line class="as-grid" x1="' + sx(xv) + '" x2="' + sx(xv) + '" y1="' + M.t + '" y2="' + bt + '"/><text x="' + sx(xv) + '" y="' + (bt + 18) + '" text-anchor="middle">' + (u.raw ? +(xv * u.k).toFixed(2) : xv) + "</text>";
    h += '<rect class="as-frame" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (bt - M.t) + '"/>';
    h += '<text class="as-axis-title" x="' + ((M.l + W - M.r) / 2) + '" y="' + (H - 10) + '" text-anchor="middle">Difference in ' + esc(xLabel(s)) + (u.raw ? "" : " (SD)") + "</text>";
    h += '<text class="as-axis-title" transform="translate(15,' + ((M.t + bt) / 2) + ') rotate(-90)" text-anchor="middle">Probability of ' + higherWord(r) + " " + esc(s.yname) + "</text>";
    curves.slice().reverse().forEach(function (c) {
      var up = "", dn = "", ln = "";
      for (i = 0; i <= 100; i++) {
        var dd = XMAX * i / 100;
        up += (i ? "L" : "M") + sx(dd).toFixed(1) + "," + sy(posc(c.ci[1], dd)).toFixed(1);
        dn = "L" + sx(dd).toFixed(1) + "," + sy(posc(c.ci[0], dd)).toFixed(1) + dn;
        ln += (i ? "L" : "M") + sx(dd).toFixed(1) + "," + sy(posc(c.r, dd)).toFixed(1);
      }
      h += '<path class="po-band ' + c.cls + '" d="' + up + dn + 'Z"/><path class="po-line ' + c.cls + '" d="' + ln + '"/>';
    });
    // Δ marker (drag on the plot or use the slider)
    var mx = sx(d), my = sy(p), right = mx > W * 0.62;
    h += '<line class="po-marker" x1="' + mx + '" x2="' + mx + '" y1="' + M.t + '" y2="' + bt + '"/>';
    h += '<line class="po-marker" x1="' + M.l + '" x2="' + mx + '" y1="' + my + '" y2="' + my + '"/>';
    h += '<circle class="po-dot" cx="' + mx + '" cy="' + my + '" r="6"/>';
    h += '<text class="po-read" x="' + (mx + (right ? -10 : 10)) + '" y="' + (my - 10) + '" text-anchor="' + (right ? "end" : "start") + '">' + pc(p) + "</text>";
    h += '<rect class="po-hit" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (bt - M.t) + '"/>';
    svg.innerHTML = h;
    plotGeom = { sx0: M.l, sx1: W - M.r };
    var lg = [['<line class="po-line po-c1" x1="-7" x2="7" y1="0" y2="0"/>', esc(curves[0].name)]];
    if (s.on.cmp) lg.push(['<line class="po-line po-c2" x1="-7" x2="7" y1="0" y2="0"/>', esc(s.name2)]);
    lg.push(['<rect class="po-band po-c1" x="-7" y="-5" width="14" height="10"/>', Math.round(lvl * 100) + "% confidence band"]);
    el.legend.innerHTML = lg.map(function (x) { return '<span><svg viewBox="-7 -7 14 14" class="as-plot" aria-hidden="true">' + x[0] + "</svg>" + x[1] + "</span>"; }).join("");
    // plain-language sentence
    el.sentence.innerHTML = "If person A scores <strong>" + esc(fmtD(s, d)) + "</strong> " + (d > 0 ? "higher" : "different") + " than person B on " + esc(xLabel(s)) +
      ", the probability that A also has the " + higherWord(r) + " " + esc(s.yname) + " is <strong>" + pc(p) + "</strong> (" + lvlTxt + pc(pl) + " to " + pc(pu) + ").";
    last = "POSC: r = " + f2(r) + ", n = " + s.n + " · Δ = " + fmtD(s, d) + " → " + pc(p);
    // probability table (the package's predict_matrix, at round differences)
    var ds = [0.25, 0.5, 1, 1.5, 2, 3];
    el.table.innerHTML = '<div class="as-key">Probability table</div><table><thead><tr><th class="as-key">Difference in ' + esc(xLabel(s)) + "</th>" +
      curves.map(function (c) { return '<th class="as-key as-num">' + (s.on.cmp ? esc(c.name) : "Probability of " + higherWord(r) + " " + esc(s.yname)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ds.map(function (dd) {
        return "<tr><td>" + esc(fmtD(s, dd)) + "</td>" + curves.map(function (c) {
          return '<td class="as-num">' + pc(posc(c.r, dd)) + '<span class="po-ci">' + pc(posc(c.ci[0], dd)) + "–" + pc(posc(c.ci[1], dd)) + "</span></td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  // ================================== 4. export, URL state, wiring
  var plotGeom = null, dragging = false;
  function setFromPointer(ev) {
    if (!plotGeom) return;
    var rect = svg.getBoundingClientRect(), x = (ev.clientX - rect.left) * (W / rect.width);
    var d = Math.max(0, Math.min(XMAX, (x - plotGeom.sx0) / (plotGeom.sx1 - plotGeom.sx0) * XMAX));
    state.dx = Math.round(d * 100) / 100;
    syncPanel(); changed();
  }
  svg.addEventListener("pointerdown", function (ev) { dragging = true; svg.setPointerCapture(ev.pointerId); setFromPointer(ev); });
  svg.addEventListener("pointermove", function (ev) { if (dragging) setFromPointer(ev); });
  svg.addEventListener("pointerup", function () { dragging = false; });
  svg.addEventListener("pointercancel", function () { dragging = false; });

  function styled(clone) {
    var src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
    var props = ["fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight"];
    var drop = [];
    for (var i = 0; i < src.length; i++) {
      if (src[i].classList.contains("po-hit")) { drop.push(dst[i]); continue; }   // the invisible drag target
      var cs = getComputedStyle(src[i]), st = "";
      props.forEach(function (p) { st += p + ":" + cs.getPropertyValue(p) + ";"; });
      dst[i].setAttribute("style", st); dst[i].removeAttribute("class");
    }
    drop.forEach(function (n) { n.remove(); });
    return clone;
  }
  function exportSvg() {
    var head = 34, clone = styled(svg.cloneNode(true)), bs = getComputedStyle(document.body);
    clone.setAttribute("xmlns", NS); clone.setAttribute("viewBox", "0 " + (-head) + " " + W + " " + (H + head));
    clone.setAttribute("width", W); clone.setAttribute("height", H + head);
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", -head); bg.setAttribute("width", W); bg.setAttribute("height", H + head); bg.setAttribute("fill", bs.backgroundColor);
    clone.insertBefore(bg, clone.firstChild);
    var tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", M.l); tx.setAttribute("y", -12);
    tx.setAttribute("style", "font-family:Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;fill:" + bs.color);
    tx.textContent = last; clone.appendChild(tx);
    return new XMLSerializer().serializeToString(clone);
  }
  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function downloadPng() {
    var img = new Image(), url = URL.createObjectURL(new Blob([exportSvg()], { type: "image/svg+xml" }));
    img.onload = function () {
      var c = document.createElement("canvas"), k = 2; c.width = img.width * k; c.height = img.height * k;
      var ctx = c.getContext("2d"); ctx.scale(k, k); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      c.toBlob(function (b) { download(b, "posc.png"); }, "image/png");
    };
    img.src = url;
  }
  function writeHash() {
    var d = defaults(), parts = [];
    if (state.dx !== d.dx) parts.push("dx=" + state.dx);
    ITEMS.forEach(function (c) { if (String(state[c.id]) !== String(d[c.id])) parts.push(c.id + "=" + encodeURIComponent(state[c.id])); });
    TOGGLES.forEach(function (t) { if (state.on[t] !== d.on[t]) parts.push("on." + t + "=" + (state.on[t] ? 1 : 0)); });
    try { history.replaceState(null, "", "#" + parts.join("&")); } catch (e) { /* ignore */ }
  }
  function readHash() {
    (location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("="), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || "");
      if (k === "dx") { var dv = Number(v); if (isFinite(dv)) state.dx = Math.max(0, Math.min(XMAX, dv)); return; }
      if (/^on\./.test(k)) { var t = k.slice(3); if (TOGGLES.indexOf(t) >= 0) state.on[t] = v === "1"; return; }
      var c = ITEMS.filter(function (x) { return x.id === k; })[0];
      if (!c) return;
      if (c.type === "text") state[k] = v.slice(0, 60);
      else if (c.options) { if (c.options.some(function (o) { return o[0] === v; })) state[k] = v; }
      else { var num = Number(v); if (isFinite(num)) state[k] = c.type === "number" ? Math.max(c.min, num) : Math.min(c.max, Math.max(c.min, num)); }
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
    var f = document.createElement("div"), uid = "po-" + c.id;
    f.className = "as-field"; f.dataset.id = c.id;
    var head = '<div class="as-field-head"><span class="as-lab">' + (c.type === "radio" ? '<span class="as-field-label" id="' + uid + '-l">' + c.label + "</span>" : '<label for="' + uid + '">' + c.label + "</label>") + infoTip(c, uid) + "</span>";
    if (c.type === "radio") {
      f.innerHTML = head + '</div><div class="as-seg" role="radiogroup" aria-labelledby="' + uid + '-l">' + c.options.map(function (o) { return '<label><input type="radio" name="' + uid + '" value="' + o[0] + '">' + o[1] + "</label>"; }).join("") + "</div>";
      f.addEventListener("change", function (ev) { state[c.id] = ev.target.value; syncPanel(); changed(); });
    } else if (c.type === "select") {
      f.innerHTML = head + '</div><select class="tr-select" id="' + uid + '">' + c.options.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select>";
      f.querySelector("select").addEventListener("change", function (ev) { state[c.id] = ev.target.value; changed(); });
    } else if (c.type === "text" || c.type === "number") {
      f.innerHTML = head + '</div><input class="tr-select po-input" id="' + uid + '" type="' + c.type + '"' + (c.type === "number" ? ' min="' + c.min + '" step="any"' : ' maxlength="60"') + ">";
      f.querySelector("input").addEventListener("input", function (ev) {
        var v = ev.target.value;
        if (c.type === "number") { v = Number(v); if (!(v > 0)) return; }
        else if (!v.trim()) v = c.val;
        state[c.id] = v; syncPanel(); changed();
      });
    } else {
      f.innerHTML = head + '<span class="as-val"></span></div><input type="range" id="' + uid + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '">';
      f.querySelector("input").addEventListener("input", function (ev) {
        state[c.id] = Number(ev.target.value); f.querySelector(".as-val").textContent = fmtVal(c, state[c.id]); changed();
      });
    }
    return f;
  }
  var dxField = null;
  function buildPanel() {
    // the difference the headline number is read at (also draggable on the plot)
    var dg = document.createElement("div"); dg.className = "as-group tr-analysis";
    dg.innerHTML = '<div class="as-group-head"><span class="as-key">Read the curve at</span></div>';
    dxField = document.createElement("div"); dxField.className = "as-field";
    dxField.innerHTML = '<div class="as-field-head"><span class="as-lab"><label for="po-dx">Difference in the predictor</label>' +
      infoTip({ label: "Difference in the predictor", info: "How much higher person A scores than person B on the predictor. You can also drag along the plot." }, "po-dx") +
      '</span><span class="as-val"></span></div><input type="range" id="po-dx" min="0" max="' + XMAX + '" step="0.05">';
    dxField.querySelector("input").addEventListener("input", function (ev) { state.dx = Number(ev.target.value); syncPanel(); changed(); });
    dg.appendChild(dxField); panel.appendChild(dg);
    GROUPS.forEach(function (grp) {
      var gd = document.createElement("div"); gd.className = "as-group";
      var head = '<div class="as-group-head"><span class="as-key">' + grp.title + "</span>";
      if (grp.toggle) head += '<label class="as-switch"><span></span><input type="checkbox" aria-label="' + grp.title + '"></label>';
      gd.innerHTML = head + "</div>";
      if (grp.toggle) {
        gd.dataset.toggle = grp.toggle;
        gd.querySelector(".as-switch input").addEventListener("change", function (ev) { state.on[grp.toggle] = ev.target.checked; syncPanel(); changed(); });
      }
      grp.items.forEach(function (c) { gd.appendChild(field(c)); });
      panel.appendChild(gd);
    });
    syncPanel();
  }
  function syncPanel() {
    dxField.querySelector("input").value = state.dx;
    dxField.querySelector(".as-val").textContent = fmtD(state, state.dx);
    ITEMS.forEach(function (c) {
      var f = panel.querySelector('.as-field[data-id="' + c.id + '"]');
      if (c.type === "radio") f.querySelectorAll("input").forEach(function (i) { i.checked = i.value === state[c.id]; });
      else if (c.type === "select") f.querySelector("select").value = state[c.id];
      else if (c.type === "text" || c.type === "number") { var inp = f.querySelector("input"); if (document.activeElement !== inp) inp.value = state[c.id]; }
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
  var hashTimer = null;
  function changed() { render(); clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 250); }

  readHash();
  buildPanel();
  app.querySelector(".as-png").addEventListener("click", downloadPng);
  app.querySelector(".as-svg").addEventListener("click", function () { download(new Blob([exportSvg()], { type: "image/svg+xml" }), "posc.svg"); });
  var copyBtn = app.querySelector(".as-copy");
  copyBtn.addEventListener("click", function () {
    writeHash();
    var url = location.href, done = function () { copyBtn.textContent = "Link copied"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 1600); };
    function fallback() { var t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ } t.remove(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
  });
  var rt = null;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(render, 120); });
  render();
})();
