/* PTF Tahmin Performansı — yalnızca geçmiş tahmin ve gerçekleşen fiyatları gösterir. */
(function () {
  "use strict";

  // Model sırası = renk sırası (sabit; filtre değişse de renk değişmez).
  var MODELLER = [
    { k: "ort",     ad: "Ana model", renk: "--s1", grup: "ana",
      acik: "Ensemble: ANA k6 nb ve YD3 nb modellerinin ortalaması. Canlıda kullanılan ana tahmin." },
    { k: "yd3nb",   ad: "YD3 nb",   renk: "--s2", grup: "ana",
      acik: "Arz tarafını ayrıca modelleyen yapı; barajlı üretimin yüksek olduğu günleri ANA modeline göre daha iyi yakalar. Fiyat–yük ilişkisi ve teklif yapısı sinyalleriyle güçlendirildi." },
    { k: "anak6nb", ad: "ANA k6 nb", renk: "--s3", grup: "ana",
      acik: "Ana model, yenilenmiş talep/rüzgâr/güneş alt modelleriyle; fiyat–yük ilişkisi ve teklif yapısı sinyalleri eklendi." },
    { k: "yd3",     ad: "YD3",      renk: "--s4", grup: "ana",
      acik: "YD3'ün önceki sürümü (nb eklemeleri öncesi)." },
    { k: "ana",     ad: "ANA (sınıflandırıcılı)", renk: "--s5", grup: "ana",
      acik: "Model 3'e barajlı üretim bilgisi ve tavan/taban saatleri için sınıflandırıcı eklendi: sınıflandırıcı bir saatin tavana ya da sıfıra vurma olasılığı %50'yi geçerse o fiyatı, geçmezse üçlü ortalamanın tahminini verir. 27.10.2026'ya kadar canlıda kullanılan model; üstteki modellerin hepsi bu sınıflandırıcıyı içerir." },
    { k: "m3",      ad: "Model 3",  renk: "--s6", grup: "gelisim",
      acik: "Model 1'e D+1 plan verileri ile kendi talep, rüzgâr ve güneş tahminlerimizden türetilen net yük eklendi. Aynı üçlü ortalama; sınıflandırıcı yok." },
    { k: "m1",      ad: "Model 1",  renk: "--s7", grup: "gelisim",
      acik: "İlk model. Yalnızca tahmin anında bilinen geçmiş fiyatlar, takvim (saat, gün, ay), resmi tatil/arife/idari izin bilgisi ve o günün tavan fiyatı. Fiyatı tavana oranlayarak öğrenir; LightGBM, XGBoost ve XGBoost-AFT'nin ortalaması. Sınıflandırıcı yok." },
    { k: "d1",      ad: "D+1 (naif)", renk: "--s8", grup: "gelisim",
      acik: "Tahmin anında bilinen en son günün (D+1) fiyatını aynen tekrarlar. Kıyas tabanı." }
  ];
  var BY = {}; MODELLER.forEach(function (m) { BY[m.k] = m; });
  var TEST_BAS = "2025-10-01", TEST_BIT = "2026-09-30", CANLI_BAS = "2026-10-14";

  var D, Y, gunSay, secili = { ort: true, d1: true }, aralik = null, grafikler = {};

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function tarih(i) { var d = new Date(D.bas + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function gunIdx(s) { return Math.round((Date.parse(s + "T00:00:00Z") - Date.parse(D.bas + "T00:00:00Z")) / 864e5); }
  var AY = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  var GUN = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
  function trTarih(d) { return String(d.getUTCDate()).padStart(2, "0") + "." + String(d.getUTCMonth() + 1).padStart(2, "0") + "." + d.getUTCFullYear(); }
  function sayi(x, b) { return x == null || isNaN(x) ? "—" : x.toLocaleString("tr-TR", { maximumFractionDigits: b || 0, minimumFractionDigits: b || 0 }); }

  function tavanGun(g) {
    var s = iso(tarih(g)), v = null;
    D.tavan.forEach(function (t) { if (s >= t[0]) v = t[1]; });
    return v;
  }
  // Tavan (≥ tavan − 1) ve taban (≤ 1 TL) saatleri: gerçek, yakalanan, yanlış alarm.
  function tavanOlc(k, g0, g1) {
    var f = D.seri[k], r = { gt: 0, it: 0, yt: 0, gb: 0, ib: 0, yb: 0, n: 0 };
    for (var g = g0; g < g1; g++) {
      var c = tavanGun(g);
      for (var h = g * 24; h < g * 24 + 24; h++) {
        var y = Y[h], t = f[h]; if (y == null || t == null) continue;
        r.n++;
        var yt = y >= c - 1, pt = t >= c - 1, yb = y <= 1, pb = t <= 1;
        if (yt) r.gt++; if (yt && pt) r.it++; if (pt && !yt) r.yt++;
        if (yb) r.gb++; if (yb && pb) r.ib++; if (pb && !yb) r.yb++;
      }
    }
    return r.n ? r : null;
  }
  function tavanTablo(g0, g1) {
    var h = "<thead><tr><th rowspan=\"2\">Model</th><th colspan=\"3\" class=\"grp\">Tavan saatleri</th><th colspan=\"3\" class=\"grp\">Taban (0 TL) saatleri</th></tr>" +
      "<tr><th>Yakalanan</th><th>Oran</th><th>Yanlış alarm</th><th>Yakalanan</th><th>Oran</th><th>Yanlış alarm</th></tr></thead><tbody>";
    var ilk = null;
    MODELLER.forEach(function (m) {
      var r = tavanOlc(m.k, g0, g1);
      var sw = '<span class="sw" style="background:var(' + m.renk + ')"></span>';
      if (!r) { h += "<tr><td>" + sw + m.ad + '</td><td class="na" colspan="6">Bu dönemde tahmin yok</td></tr>'; return; }
      if (!ilk) ilk = r;
      function hc(i, g) { return '<td class="num">' + sayi(i) + " / " + sayi(g) + '</td><td class="num">' + (g ? "%" + sayi(100 * i / g) : "—") + "</td>"; }
      h += '<tr class="' + (secili[m.k] ? "hl" : "") + '"><td>' + sw + m.ad + "</td>" + hc(r.it, r.gt) + '<td class="num">' + sayi(r.yt) + "</td>" + hc(r.ib, r.gb) + '<td class="num">' + sayi(r.yb) + "</td></tr>";
    });
    document.getElementById("tavan-tablo").innerHTML = h + "</tbody>";
    document.getElementById("tavan-yazi").textContent = trTarih(tarih(g0)) + " – " + trTarih(tarih(g1 - 1)) + " · bu dönemde " + sayi(ilk ? ilk.gt : 0) + " tavan ve " + sayi(ilk ? ilk.gb : 0) + " taban saati gerçekleşti.";
  }

  // Ölçüler: [g0, g1) gün aralığında, modelin değeri olan saatlerde.
  function olc(k, g0, g1, saatSec) {
    var f = D.seri[k], n = 0, ae = 0, e = 0, aeN = 0, nd = D.seri.d1;
    for (var h = g0 * 24; h < g1 * 24; h++) {
      if (saatSec != null && h % 24 !== saatSec) continue;
      var y = Y[h], t = f[h];
      if (y == null || t == null) continue;
      n++; ae += Math.abs(t - y); e += t - y;
      if (nd[h] != null) aeN += Math.abs(nd[h] - y);
    }
    if (!n) return null;
    return { mae: ae / n, bias: e / n, rel: 1 - ae / aeN, n: n };
  }

  function ozet() {
    var t0 = gunIdx(TEST_BAS), t1 = gunIdx(TEST_BIT) + 1;
    var a = olc("ort", t0, t1), n = olc("d1", t0, t1), m1 = olc("m1", t0, t1);
    var c0 = gunIdx(CANLI_BAS), canli = olc("ort", c0, gunSay), son30 = olc("ort", gunSay - 30, gunSay);
    var kp = [
      { k: "Ana model · 12 ay MAE", v: sayi(a.mae), u: "TL/MWh", d: "01.10.2025 – 30.09.2026 walk-forward" },
      { k: "Naif tahmine göre", v: "−%" + sayi(a.rel * 100), u: "", d: "D+1 naif: " + sayi(n.mae) + " TL/MWh" },
      { k: "Model 1'e göre", v: "−%" + sayi((1 - a.mae / m1.mae) * 100), u: "", d: "İlk model: " + sayi(m1.mae) + " TL/MWh" },
      { k: "Son 30 gün MAE", v: sayi(son30.mae), u: "TL/MWh", d: "Canlı (" + trTarih(tarih(c0)) + "'ten beri): " + sayi(canli.mae) }
    ];
    document.getElementById("kpis").innerHTML = kp.map(function (x) {
      return '<div class="kpi"><p class="k">' + x.k + '</p><div class="v">' + x.v + (x.u ? "<small>" + x.u + "</small>" : "") + '</div><div class="d">' + x.d + "</div></div>";
    }).join("");
  }

  function ortak() {
    Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css("--text-2");
    Chart.defaults.borderColor = css("--line");
  }
  function tooltip() {
    return { backgroundColor: css("--surface"), titleColor: css("--text"), bodyColor: css("--text-2"),
      borderColor: css("--line"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true };
  }

  function gelisim() {
    var t0 = gunIdx(TEST_BAS), t1 = gunIdx(TEST_BIT) + 1;
    var sira = ["d1", "m1", "m3", "ana", "yd3", "anak6nb", "yd3nb", "ort"];
    var vals = sira.map(function (k) { return olc(k, t0, t1).mae; });
    var best = Math.min.apply(null, vals);
    var cols = vals.map(function (v) { return v === best ? css("--bar-best") : css("--bar"); });
    var etiket = {
      id: "etiket", afterDatasetsDraw: function (ch) {
        var c = ch.ctx, meta = ch.getDatasetMeta(0);
        c.save(); c.font = '500 12px "IBM Plex Mono", monospace'; c.fillStyle = css("--text"); c.textBaseline = "middle";
        meta.data.forEach(function (b, i) { c.fillText(sayi(vals[i], 1), b.x + 8, b.y); });
        c.restore();
      }
    };
    if (grafikler.g) grafikler.g.destroy();
    grafikler.g = new Chart(document.getElementById("gelisim"), {
      type: "bar",
      data: { labels: sira.map(function (k) { return BY[k].ad; }),
        datasets: [{ data: vals, backgroundColor: cols, borderRadius: 4, borderSkipped: "start", barPercentage: .72, categoryPercentage: .9 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 56 } },
        plugins: { legend: { display: false }, tooltip: Object.assign(tooltip(), { callbacks: {
          label: function (c) { return "MAE " + sayi(c.raw, 1) + " TL/MWh · naife göre −%" + sayi((1 - c.raw / vals[0]) * 100); },
          afterLabel: function (c) { return BY[sira[c.dataIndex]].acik; } } }) },
        scales: { x: { beginAtZero: true, grid: { color: css("--line") }, border: { display: false }, title: { display: true, text: "MAE (TL/MWh)" } },
          y: { grid: { display: false }, border: { display: false } } } },
      plugins: [etiket]
    });
  }

  function chips() {
    var el = document.getElementById("chips");
    el.innerHTML = '<span class="chip fixed"><span class="sw"></span>Gerçekleşen PTF</span>' +
      MODELLER.map(function (m) {
        return '<button type="button" class="chip' + (secili[m.k] ? " on" : "") + '" data-k="' + m.k + '" style="--c:var(' + m.renk + ')" title="' + m.acik + '" aria-pressed="' + !!secili[m.k] + '"><span class="sw"></span>' + m.ad + "</button>";
      }).join("");
    el.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { secili[b.dataset.k] = !secili[b.dataset.k]; chips(); ciz(); };
    });
  }

  function aralikAyarla(g0, g1) {
    g0 = Math.max(0, g0); g1 = Math.min(gunSay, g1);
    if (g1 <= g0) g1 = g0 + 1;
    aralik = [g0, g1];
    document.getElementById("bas").value = iso(tarih(g0));
    document.getElementById("bit").value = iso(tarih(g1 - 1));
    ciz();
  }

  function ciz() {
    var g0 = aralik[0], g1 = aralik[1], gunluk = g1 - g0 > 31;
    document.getElementById("donem-yazi").textContent = trTarih(tarih(g0)) + " – " + trTarih(tarih(g1 - 1)) + " · " + (g1 - g0) + " gün · " + (gunluk ? "günlük ortalama" : "saatlik") + " (TL/MWh)";
    var labels = [], keys = ["gercek"].concat(MODELLER.filter(function (m) { return secili[m.k]; }).map(function (m) { return m.k; }));
    var veri = {}; keys.forEach(function (k) { veri[k] = []; });
    if (gunluk) {
      for (var g = g0; g < g1; g++) {
        var d = tarih(g); labels.push(d.getUTCDate() + " " + AY[d.getUTCMonth()] + (d.getUTCMonth() === 0 && d.getUTCDate() <= 7 || g === g0 ? " " + d.getUTCFullYear() : ""));
        keys.forEach(function (k) {
          var s = 0, n = 0; for (var h = g * 24; h < g * 24 + 24; h++) { var v = D.seri[k][h]; if (v != null) { s += v; n++; } }
          veri[k].push(n === 24 ? s / n : null);
        });
      }
    } else {
      for (var h = g0 * 24; h < g1 * 24; h++) {
        var dd = tarih(Math.floor(h / 24)), saat = String(h % 24).padStart(2, "0") + ":00";
        labels.push(g1 - g0 === 1 ? saat : (innerWidth < 600 ? "" : GUN[dd.getUTCDay()] + " ") + dd.getUTCDate() + " " + AY[dd.getUTCMonth()] + " " + saat);
        keys.forEach(function (k) { veri[k].push(D.seri[k][h]); });
      }
    }
    var ds = keys.map(function (k) {
      var gercek = k === "gercek";
      return { label: gercek ? "Gerçekleşen PTF" : BY[k].ad, data: veri[k],
        borderColor: gercek ? css("--ink") : css(BY[k].renk), backgroundColor: gercek ? css("--ink") : css(BY[k].renk),
        borderWidth: gercek ? 2.5 : 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: false, order: gercek ? 0 : 1 };
    });
    if (grafikler.s) grafikler.s.destroy();
    grafikler.s = new Chart(document.getElementById("seri"), {
      type: "line", data: { labels: labels, datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: Object.assign(tooltip(), { callbacks: {
          label: function (c) { return " " + c.dataset.label + ": " + sayi(c.raw) + " TL/MWh"; } } }) },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: innerWidth < 600 ? 3 : 8 } },
          y: { beginAtZero: true, grid: { color: css("--line") }, border: { display: false }, ticks: { callback: function (v) { return sayi(v); } } } } }
    });
    tablo(g0, g1); tavanTablo(g0, g1); saatGrafik(g0, g1);
  }

  function tablo(g0, g1) {
    var rows = MODELLER.map(function (m) { return { m: m, o: olc(m.k, g0, g1) }; });
    var maes = rows.filter(function (r) { return r.o; }).map(function (r) { return r.o.mae; });
    var best = Math.min.apply(null, maes);
    var h = "<thead><tr><th>Model</th><th>MAE</th><th>Yanlılık</th><th>D+1'e göre</th><th>Saat</th><th class=\"dcol\">Açıklama</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      var sw = '<span class="sw" style="background:var(' + r.m.renk + ')"></span>';
      if (!r.o) { h += "<tr><td>" + sw + r.m.ad + '</td><td class="na" colspan="4">Bu dönemde tahmin yok</td><td class="desc dcol">' + r.m.acik + "</td></tr>"; return; }
      h += '<tr class="' + (secili[r.m.k] ? "hl" : "") + '"><td>' + sw + r.m.ad + '</td><td class="num' + (r.o.mae === best ? " best" : "") + '">' + sayi(r.o.mae, 1) + '</td><td class="num">' + (r.o.bias > 0 ? "+" : "") + sayi(r.o.bias, 1) +
        '</td><td class="num">' + (r.m.k === "d1" ? "—" : (r.o.rel >= 0 ? "−%" : "+%") + sayi(Math.abs(r.o.rel) * 100)) + '</td><td class="num">' + sayi(r.o.n) + '</td><td class="desc dcol">' + r.m.acik + "</td></tr>";
    });
    document.getElementById("donem-tablo").innerHTML = h + "</tbody>";
  }

  function saatGrafik(g0, g1) {
    var ks = MODELLER.filter(function (m) { return secili[m.k]; });
    var ds = ks.map(function (m) {
      var arr = []; for (var s = 0; s < 24; s++) { var o = olc(m.k, g0, g1, s); arr.push(o ? o.mae : null); }
      return { label: m.ad, data: arr, borderColor: css(m.renk), backgroundColor: css(m.renk), borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 };
    });
    if (grafikler.h) grafikler.h.destroy();
    grafikler.h = new Chart(document.getElementById("saat"), {
      type: "line", data: { labels: Array.from({ length: 24 }, function (_, i) { return String(i).padStart(2, "0"); }), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: ds.length > 1, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
          tooltip: Object.assign(tooltip(), { callbacks: { title: function (c) { return "Saat " + c[0].label + ":00"; },
            label: function (c) { return " " + c.dataset.label + ": " + sayi(c.raw, 1); } } }) },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, title: { display: true, text: "Saat" } },
          y: { beginAtZero: true, grid: { color: css("--line") }, border: { display: false }, title: { display: true, text: "MAE (TL/MWh)" } } } }
    });
  }

  function aylik() {
    var aylar = [], g = 0;
    while (g < gunSay) {
      var d = tarih(g), y = d.getUTCFullYear(), m = d.getUTCMonth(), bas = g;
      while (g < gunSay && tarih(g).getUTCMonth() === m) g++;
      aylar.push({ ad: AY[m] + " " + y, g0: bas, g1: g, eksik: g - bas < new Date(Date.UTC(y, m + 1, 0)).getUTCDate() });
    }
    var cols = ["ort", "yd3nb", "anak6nb", "yd3", "ana", "m3", "d1"];
    var h = "<thead><tr><th>Ay</th>" + cols.map(function (k) { return "<th>" + BY[k].ad.replace(" (naif)", "").replace(" (sınıflandırıcılı)", "") + "</th>"; }).join("") + "</tr></thead><tbody>";
    aylar.reverse().forEach(function (a) {
      var v = cols.map(function (k) { var o = olc(k, a.g0, a.g1); return o ? o.mae : null; });
      var best = Math.min.apply(null, v.filter(function (x) { return x != null; }));
      h += "<tr><td>" + a.ad + (a.eksik ? "*" : "") + "</td>" + v.map(function (x) {
        return '<td class="num' + (x === best ? " best" : "") + (x == null ? " na" : "") + '">' + sayi(x) + "</td>";
      }).join("") + "</tr>";
    });
    document.getElementById("aylik").innerHTML = h + "</tbody>";
  }

  function hepsiniCiz() { ortak(); gelisim(); ciz(); }

  function tema() {
    var btn = document.getElementById("tema");
    var kayit = null; try { kayit = localStorage.getItem("tema"); } catch (e) {}
    if (kayit) document.documentElement.setAttribute("data-theme", kayit);
    btn.onclick = function () {
      var koyu = document.documentElement.getAttribute("data-theme") ? document.documentElement.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      var yeni = koyu ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", yeni);
      try { localStorage.setItem("tema", yeni); } catch (e) {}
      hepsiniCiz();
    };
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", hepsiniCiz);
  }

  fetch("data/ptf.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    D = d; Y = d.seri.gercek; gunSay = d.gun;
    document.getElementById("guncelleme").textContent = "Son gerçekleşen gün: " + trTarih(tarih(gunSay - 1));
    document.getElementById("kaynak-not").textContent = "Veri: EPİAŞ Şeffaflık Platformu · Tahminler: kendi modellerim";
    tema(); ozet(); chips(); aylik(); ortak(); gelisim();
    document.querySelectorAll(".seg button").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll(".seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
        var n = +b.dataset.gun; aralikAyarla(gunSay - n, gunSay);
      };
    });
    ["bas", "bit"].forEach(function (id) {
      var el = document.getElementById(id);
      el.min = iso(tarih(0)); el.max = iso(tarih(gunSay - 1));
      el.onchange = function () {
        document.querySelectorAll(".seg button").forEach(function (x) { x.classList.remove("on"); });
        var a = gunIdx(document.getElementById("bas").value), b = gunIdx(document.getElementById("bit").value) + 1;
        if (!isNaN(a) && !isNaN(b)) aralikAyarla(a, b);
      };
    });
    aralikAyarla(gunSay - 7, gunSay);
  }).catch(function (e) {
    document.getElementById("kpis").innerHTML = '<div class="kpi"><p class="k">Veri yüklenemedi</p><div class="d">' + e + "</div></div>";
  });
})();
