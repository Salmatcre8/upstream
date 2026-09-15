(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const setText = (id, value) => { document.getElementById(id).textContent = String(value); };
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TOTAL_WEIGHT = 1000000;

  /* Theme */
  const themeButton = $("#theme-toggle");
  function applyTheme(theme) {
    if (theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    setText("theme-label", theme === "dark" ? "Light" : "Dark");
    themeButton.setAttribute("aria-pressed", String(theme === "dark"));
  }
  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");
  themeButton.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("upstream-theme", next); } catch (e) { /* storage unavailable */ }
  });

  /* Reading progress */
  const progressBar = $("#progress-bar");
  function updateProgress() {
    const scrollable = root.scrollHeight - window.innerHeight;
    const pct = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
    progressBar.style.width = pct + "%";
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  /* Fig. 01: dependency tree flow */
  const flow = { phase: 0, playing: !reduceMotion, timers: [] };
  const flowEl = $("#flow");
  const flowSvg = $("#flow-svg");
  const flowButton = $("#flow-toggle");
  const edges = {
    dep: $("#up-e-dep"), main: $("#up-e-main"), pull: $("#up-e-pull"),
    l1: $("#up-e-l1"), l2: $("#up-e-l2")
  };
  const PHASE_LABELS = ["idle", "deposit(100 XLM)", "collect · pull", "collect"];

  function renderFlow() {
    const p = flow.phase;
    edges.dep.classList.toggle("is-live", p === 1);
    edges.main.classList.toggle("is-live", p === 2);
    edges.pull.classList.toggle("is-live-lav", p === 2);
    edges.l1.classList.toggle("is-live", p === 3);
    edges.l2.classList.toggle("is-live", p === 3);
    setText("flow-split1", p === 0 ? "0" : "100");
    setText("flow-split0", p >= 2 ? "10" : "0");
    setText("flow-maint", p >= 2 ? "collected 90" : "claimable 0");
    setText("flow-l1", p >= 3 ? "collected 6" : "claimable 0");
    setText("flow-l2", p >= 3 ? "collected 4" : "claimable 0");
    setText("flow-label", PHASE_LABELS[p]);
    flowButton.textContent = flow.playing ? "Pause" : "Play";
    flowEl.classList.toggle("is-paused", !flow.playing);
  }

  function clearFlowTimers() {
    flow.timers.forEach(clearTimeout);
    flow.timers = [];
  }

  function scheduleFlow() {
    clearFlowTimers();
    [[0, 0], [1100, 1], [2800, 2], [4600, 3], [5900, 0]].forEach(([delay, phase]) => {
      flow.timers.push(setTimeout(() => { flow.phase = phase; renderFlow(); }, delay));
    });
    flow.timers.push(setTimeout(() => { if (flow.playing) scheduleFlow(); }, 6000));
  }

  function startFlow() {
    flow.playing = true;
    flow.phase = 0;
    if (flowSvg.setCurrentTime) flowSvg.setCurrentTime(0);
    if (flowSvg.unpauseAnimations) flowSvg.unpauseAnimations();
    scheduleFlow();
    renderFlow();
  }

  function stopFlow() {
    flow.playing = false;
    clearFlowTimers();
    if (flowSvg.pauseAnimations) flowSvg.pauseAnimations();
    renderFlow();
  }

  flowButton.addEventListener("click", () => (flow.playing ? stopFlow() : startFlow()));
  if (flow.playing) startFlow(); else stopFlow();

  /* Fig. 02: push vs pull */
  let pushed = false;
  const PUSH_RESULT = { alice: "REVERTED", bob: "REVERTED", carol: "FAILS · no trustline" };
  function renderPush() {
    $$("[data-push]").forEach((el) => {
      el.textContent = pushed ? PUSH_RESULT[el.dataset.push] : "pending";
      el.classList.toggle("is-on", pushed);
    });
    setText("push-note", pushed
      ? "carol's failure reverts the payout for all three"
      : "One transaction pays alice, bob and carol. Run it.");
  }
  $("#push-run").addEventListener("click", () => { pushed = !pushed; renderPush(); });

  const pull = { alice: 0, bob: 0, carol: 0 };
  const PULL_RESULT = { alice: "✓ paid 7 XLM", bob: "✓ paid 3 XLM", carol: "✕ retry later" };
  function renderPull() {
    $$("[data-collect]").forEach((button) => {
      const who = button.dataset.collect;
      button.textContent = pull[who] ? PULL_RESULT[who] : "collect()";
    });
    const settled = Object.values(pull).filter(Boolean).length;
    setText("pull-tx", `${settled} of 3 transactions`);
    setText("pull-note", pull.carol === 2
      ? "only carol's collect fails; her share stays claimable"
      : "Three separate transactions. Settle each recipient yourself.");
  }
  $$("[data-collect]").forEach((button) => {
    button.addEventListener("click", () => {
      const who = button.dataset.collect;
      pull[who] = who === "carol" ? 2 : 1;
      renderPull();
    });
  });
  $("#pull-reset").addEventListener("click", () => {
    pull.alice = 0; pull.bob = 0; pull.carol = 0;
    renderPull();
  });

  /* Fig. 03: epochs */
  const EPOCH_STEPS = [
    { ev: "create_split(owner, [alice 1,000,000], false) → id 1, epoch 0", a0: 0, a1: null, p0: 0, p1: 0 },
    { ev: "deposit(funder, 1, XLM, 100) → credited 100", a0: 100, a1: null, p0: 0, p1: 0 },
    { ev: "update_recipients(1, [bob 1,000,000]) → epoch 1", a0: 100, a1: 0, p0: 0, p1: 0 },
    { ev: "deposit(funder, 1, XLM, 250) → credited 250 to epoch 1", a0: 100, a1: 250, p0: 0, p1: 0 },
    { ev: "collect(1, 0, alice, XLM) → 100", a0: 100, a1: 250, p0: 100, p1: 0 },
    { ev: "collect(1, 1, bob, XLM) → 250", a0: 100, a1: 250, p0: 100, p1: 250 }
  ];
  const epochRange = $("#epoch-range");
  function renderEpoch() {
    const step = Number(epochRange.value);
    const s = EPOCH_STEPS[step];
    setText("epoch-step", `${step} of 5`);
    setText("epoch-event", s.ev);
    epochRange.setAttribute("aria-valuetext", s.ev);
    setText("e0-state", step >= 2 ? "closed · claimable forever" : "current");
    setText("e1-state", step < 2 ? "not created" : "current");
    setText("e0-acc", s.a0);
    setText("e0-claim", s.a0 - s.p0);
    setText("e0-paid", s.p0);
    setText("e1-acc", s.a1 === null ? "—" : s.a1);
    setText("e1-claim", s.a1 === null ? "—" : s.a1 - s.p1);
    setText("e1-paid", s.a1 === null ? "—" : s.p1);
  }
  epochRange.addEventListener("input", renderEpoch);

  /* Fig. 04: rounding */
  const floorShare = (weight, acc) => Math.floor((weight * acc) / TOTAL_WEIGHT);
  const round = { n: 0, running: false, timer: null };
  const roundButton = $("#round-run");
  function renderRound() {
    const n = round.n;
    const naive = n * 3;
    const total = n * 10;
    const upA = floorShare(333333, total);
    const upB = floorShare(333333, total);
    const upC = floorShare(333334, total);
    setText("round-label", `${n} / 30`);
    setText("round-total", total);
    setText("naive-a", naive); setText("naive-b", naive); setText("naive-c", naive);
    setText("naive-lost", total - naive * 3);
    setText("up-a", upA); setText("up-b", upB); setText("up-c", upC);
    setText("up-lost", total - (upA + upB + upC));
    roundButton.textContent = round.running ? "Stop" : n >= 30 ? "Run again" : "Run 30 deposits";
  }
  roundButton.addEventListener("click", () => {
    clearInterval(round.timer);
    if (round.running) { round.running = false; renderRound(); return; }
    if (reduceMotion) { round.n = 30; renderRound(); return; }
    round.n = 0;
    round.running = true;
    renderRound();
    round.timer = setInterval(() => {
      round.n += 1;
      if (round.n >= 30) { round.n = 30; round.running = false; clearInterval(round.timer); }
      renderRound();
    }, 70);
  });

  /* Fig. 05: build a split */
  const EXTRA_NAMES = ["lib-three", "lib-four"];
  const builder = {
    names: ["alice", "lib-one", "lib-two"],
    weights: [400000, 350000, 250000],
    depositXlm: 1000
  };
  const rowsEl = $("#split-rows");

  function normalize(weights) {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const out = weights.map((w) => Math.max(1, Math.round((w / total) * TOTAL_WEIGHT)));
    out[out.length - 1] += TOTAL_WEIGHT - out.reduce((a, b) => a + b, 0);
    return out;
  }

  // Stroops are BigInt so large deposits stay exact.
  function formatXlm(stroops) {
    const digits = stroops.toString().padStart(8, "0");
    const whole = digits.slice(0, -7).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${whole}.${digits.slice(-7)}`;
  }

  function buildRows() {
    rowsEl.textContent = "";
    builder.names.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "split-row";
      const label = document.createElement("div");
      label.className = "name";
      label.textContent = name;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "10000";
      input.max = "900000";
      input.step = "1000";
      input.id = `weight-${i}`;
      input.dataset.i = String(i);
      input.setAttribute("aria-label", `Weight for ${name}`);
      input.addEventListener("input", onWeightInput);
      const ppm = document.createElement("div");
      ppm.className = "ppm";
      const pay = document.createElement("div");
      pay.className = "pay";
      row.append(label, input, ppm, pay);
      rowsEl.append(row);
    });
    renderBuilder();
  }

  function renderBuilder(activeInput) {
    const acc = BigInt(builder.depositXlm) * 10000000n;
    let paid = 0n;
    builder.weights.forEach((weight, i) => {
      const share = (BigInt(weight) * acc) / BigInt(TOTAL_WEIGHT);
      paid += share;
      const row = rowsEl.children[i];
      const input = row.querySelector("input");
      if (input !== activeInput) input.value = String(weight);
      input.setAttribute("aria-valuetext", `${weight.toLocaleString("en-US")} ppm`);
      row.querySelector(".ppm").textContent = weight.toLocaleString("en-US");
      row.querySelector(".pay").textContent = formatXlm(share);
    });
    setText("recipient-count", `${builder.weights.length} recipients`);
    setText("deposit-stroops", acc.toLocaleString("en-US"));
    setText("paid-total", formatXlm(paid));
    setText("dust", `dust retained: ${(acc - paid).toString()} stroops`);
    $("#remove-recipient").disabled = builder.weights.length <= 2;
    $("#add-recipient").disabled = builder.weights.length >= 5;
  }

  function onWeightInput(event) {
    const i = Number(event.target.dataset.i);
    const value = Number(event.target.value);
    const weights = builder.weights;
    const others = weights.reduce((sum, w, j) => (j === i ? sum : sum + w), 0);
    const rest = TOTAL_WEIGHT - value;
    builder.weights = normalize(weights.map((w, j) => {
      if (j === i) return value;
      return others > 0 ? (w / others) * rest : rest / (weights.length - 1);
    }));
    renderBuilder(event.target);
  }

  $("#add-recipient").addEventListener("click", () => {
    if (builder.weights.length >= 5) return;
    builder.names.push(EXTRA_NAMES[builder.names.length - 3]);
    builder.weights = normalize(builder.weights.concat([200000]));
    buildRows();
  });

  $("#remove-recipient").addEventListener("click", () => {
    if (builder.weights.length <= 2) return;
    builder.names.pop();
    builder.weights = normalize(builder.weights.slice(0, -1));
    buildRows();
  });

  $("#deposit-xlm").addEventListener("input", (event) => {
    const value = Math.floor(Number(event.target.value)) || 0;
    builder.depositXlm = Math.max(1, Math.min(1e9, value));
    renderBuilder();
  });

  renderPush();
  renderPull();
  renderEpoch();
  renderRound();
  buildRows();
})();
