import { useState, useEffect, useRef, useCallback } from 'react'
import { initializeApp, getApps }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getDatabase, ref, onValue }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'

const firebaseConfig = {
  apiKey:      "AIzaSyBAaslSPUuviuQYy80FbuP9V6C9Gtcn_0g",
  databaseURL: "https://dalogecu-default-rtdb.firebaseio.com/"
}
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const _db  = getDatabase(_app)

const FB_PATH     = '/ecu/live'
const HISTORY_LEN = 120   // simpan 120 titik (lebih banyak untuk riwayat panjang)

const C = {
  rpm: '#0077ff',
  afr: '#e07b00',
  bat: '#00a85a',
  eot: '#d95f00',
  iat: '#2d6fd4',
  red: '#d9263d',
  dim: 'rgba(0,50,120,0.08)',
}

// ════════════════════════════════════════════════════════════
//  HOOK DATA HISTORIS REAL-TIME
//  FIX: gunakan useRef untuk buffer history — tidak trigger
//       re-render setiap tick, state hanya di-update berkala
// ════════════════════════════════════════════════════════════
function useHistory() {
  // Buffer ref: tidak memicu re-render
  const bufRef = useRef({ rpm: [], bat: [], eot: [], iat: [], afr: [], timestamps: [] })

  // State yang benar-benar di-render — di-update tiap N detik
  const [hist,      setHist]      = useState({ rpm: [], bat: [], eot: [], iat: [], afr: [], timestamps: [] })
  const [connected, setConnected] = useState(false)
  const [lastVal,   setLastVal]   = useState(null)

  useEffect(() => {
    const liveRef = ref(_db, FB_PATH)

    // Timer flush: salin buffer ke state setiap 1 detik
    // Ini mencegah setState dipanggil setiap data masuk (bisa ratusan kali/menit)
    const flushTimer = setInterval(() => {
      setHist({ ...bufRef.current })
    }, 1000)

    const unsub = onValue(
      liveRef,
      (snap) => {
        if (!snap.exists()) return
        const d   = snap.val()
        const now = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        const point = {
          rpm: Number(d.rpm ?? 0),
          bat: Number(d.bat ?? 12.8),
          eot: Number(d.eot ?? 75),
          iat: Number(d.iat ?? 35),
          afr: Number(d.afr ?? 14.7),
        }

        // Tulis ke buffer (ref) — tanpa setState
        const b    = bufRef.current
        const push = (arr, v) => { arr.push(v); if (arr.length > HISTORY_LEN) arr.shift() }
        push(b.rpm,        point.rpm)
        push(b.bat,        point.bat)
        push(b.eot,        point.eot)
        push(b.iat,        point.iat)
        push(b.afr,        point.afr)
        push(b.timestamps, now)

        // lastVal dan connected boleh setState langsung — perubahan kecil
        setConnected(true)
        setLastVal(point)
      },
      (err) => {
        console.error('[Firebase] Grafik error:', err)
        setConnected(false)
      }
    )

    return () => {
      unsub()
      clearInterval(flushTimer)
    }
  }, [])  // <-- dependency array KOSONG: hanya mount/unmount

  return { hist, connected, lastVal }
}

// ════════════════════════════════════════════════════════════
//  CANVAS CHART RENDERER
//  FIX: dependency array [datasets, showRefLines] — hanya
//       redraw ketika data atau toggle benar-benar berubah
// ════════════════════════════════════════════════════════════
function SensorChart({ label, datasets, height = 160, showRefLines }) {
  const canvasRef = useRef(null)

  // draw function dibungkus useCallback agar stabil
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W   = canvas.offsetWidth
    if (W === 0) return          // belum mount
    const H   = height

    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    if (!datasets || datasets.every(d => d.data.length < 2)) {
      ctx.fillStyle = 'rgba(0,50,120,0.35)'
      ctx.font      = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Menunggu data…', W / 2, H / 2)
      return
    }

    // Grid horizontal
    ctx.strokeStyle = 'rgba(0,85,204,0.12)'
    ctx.lineWidth   = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = (H - 12) * (i / 4) + 6
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    datasets.forEach(({ data, color, min, max, refLines }) => {
      if (data.length < 2) return
      const span = max - min || 1
      const N    = data.length
      const step = W / (N - 1)
      const yOf  = v => H - 12 - ((Math.min(max, Math.max(min, v)) - min) / span) * (H - 18)

      // Garis referensi
      if (refLines && showRefLines) {
        refLines.forEach(({ val, color: rc, dash }) => {
          const y = yOf(val)
          ctx.save()
          ctx.strokeStyle = rc || 'rgba(0,85,204,0.2)'
          ctx.lineWidth   = 0.8
          ctx.setLineDash(dash || [])
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
          ctx.restore()
        })
      }

      // Fill gradien
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, color + '30')
      grad.addColorStop(1, 'transparent')
      ctx.beginPath()
      data.forEach((v, i) => {
        const x = i * step, y = yOf(v)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.lineTo((N - 1) * step, H)
      ctx.lineTo(0, H)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // Garis utama
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth   = 1.8
      ctx.lineJoin    = 'round'
      ctx.lineCap     = 'round'
      data.forEach((v, i) => {
        const x = i * step, y = yOf(v)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Titik terakhir
      ctx.beginPath()
      ctx.arc((N - 1) * step, yOf(data[N - 1]), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }, [datasets, height, showRefLines])

  // Jalankan draw hanya ketika data atau toggle berubah
  useEffect(() => { draw() }, [draw])

  // Resize observer — redraw jika lebar kontainer berubah
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !window.ResizeObserver) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block', borderRadius: '4px' }}
    />
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN CHART CARD
// ════════════════════════════════════════════════════════════
function ChartCard({ title, children, badge, badgeColor, delay = 0 }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.92)',
      border: '1.5px solid rgba(0,85,204,0.18)',
      borderRadius: '14px', padding: '12px 14px',
      boxShadow: '0 2px 12px rgba(0,85,204,0.06)',
      animation: `cardReveal 0.4s cubic-bezier(0.34,1.56,0.64,1) both`,
      animationDelay: `${delay}s`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.2px', color: 'rgba(0,40,110,0.65)', textTransform: 'uppercase' }}>
          {title}
        </span>
        {badge && (
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
            padding: '2px 8px', borderRadius: '5px',
            background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`,
            color: badgeColor, transition: 'all 0.3s'
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  ANALISIS TREN
// ════════════════════════════════════════════════════════════
function analyzeTrend(hist) {
  if (!hist.afr.length) return []
  const n      = hist.afr.length
  const avg    = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const results = []

  if (n >= 5) {
    const rw = hist.rpm.slice(-5), aw = hist.afr.slice(-5)
    const rD = rw[4] - rw[0], aD = aw[4] - aw[0]
    if (avg(rw) > 3000 && rD > 500 && aD > -0.3)
      results.push({ level: 'warn', icon: '⚡', text: `RPM naik ${Math.round(rD)} rpm dalam 5 sample terakhir, AFR tidak turun signifikan (${aD >= 0 ? '+' : ''}${aD.toFixed(2)}) — injektor mungkin tidak enrichment saat akselerasi` })
  }
  if (n >= 8) {
    const es = hist.eot.slice(-8)
    if (es.every((v, i) => i === 0 || v >= es[i - 1] - 0.5) && es[7] > 85)
      results.push({ level: es[7] > 100 ? 'danger' : 'warn', icon: '🌡', text: `EOT terus naik selama 8 sample (${es[0].toFixed(1)}°C → ${es[7].toFixed(1)}°C) — awasi overheating` })
  }
  if (n >= 3) {
    const bA = avg(hist.bat.slice(-3)), rA = avg(hist.rpm.slice(-3))
    if (rA > 1000 && bA < 13.4)
      results.push({ level: 'danger', icon: '🔋', text: `Rata-rata BAT ${bA.toFixed(2)}V saat RPM ${Math.round(rA)} — alternator tidak charging (normal: 13.5–14.8V)` })
  }
  if (n >= 3) {
    const iA = avg(hist.iat.slice(-3)), aA = avg(hist.afr.slice(-3))
    if (iA > 45 && aA > 15.2)
      results.push({ level: 'warn', icon: '💨', text: `Rata-rata IAT ${iA.toFixed(1)}°C + AFR ${aA.toFixed(2)} lean — ECU tidak kompensasi udara panas` })
  }
  if (!results.length)
    results.push({ level: 'ok', icon: '✦', text: 'Tidak ada anomali tren terdeteksi — semua korelasi sensor dalam batas normal' })

  return results
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN PEMBANTU
// ════════════════════════════════════════════════════════════
function LegendItem({ color, label, value, unit = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ width: '12px', height: '2.5px', borderRadius: '2px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '10px', color: 'rgba(0,50,120,0.55)', fontWeight: 700, fontStyle: 'italic' }}>
        {label}
        {value !== undefined && <span style={{ color, marginLeft: '4px', transition: 'color 0.3s' }}>{value}{unit}</span>}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN UTAMA
// ════════════════════════════════════════════════════════════
function Grafik() {
  const { hist, connected, lastVal } = useHistory()
  const [showRef, setShowRef]        = useState(true)

  const trends    = analyzeTrend(hist)
  const hasDanger = trends.some(t => t.level === 'danger')

  const trendLevelStyle = {
    danger: { bg: 'rgba(217,38,61,0.07)',  border: 'rgba(217,38,61,0.25)'  },
    warn:   { bg: 'rgba(224,123,0,0.07)',  border: 'rgba(224,123,0,0.25)'  },
    ok:     { bg: 'rgba(0,168,90,0.06)',   border: 'rgba(0,168,90,0.2)'    },
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div className="checker-board"><div className="checker-grid"></div></div>

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div style={{
        zIndex: 2, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid rgba(0,85,204,0.12)',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)',
      }}>
        {/* Kiri: status + pts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '6px',
            background: connected ? 'rgba(0,168,90,0.08)' : 'rgba(217,38,61,0.08)',
            border: `1px solid ${connected ? 'rgba(0,168,90,0.25)' : 'rgba(217,38,61,0.25)'}`,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
              color: connected ? C.bat : C.red }}>
              {connected ? '● LIVE' : '○ OFFLINE'}
            </span>
            <span style={{ fontSize: '10px', color: 'rgba(0,50,120,0.45)' }}>
              {hist.rpm.length} pts
            </span>
          </div>
          {hasDanger && (
            <div style={{
              padding: '4px 10px', borderRadius: '6px',
              background: 'rgba(217,38,61,0.08)', border: '1px solid rgba(217,38,61,0.3)',
              fontSize: '10px', fontWeight: 800, color: C.red, letterSpacing: '0.5px'
            }}>
              ⚠ ANOMALI TERDETEKSI
            </div>
          )}
        </div>

        {/* Tengah: nilai terkini inline */}
        {lastVal && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {[
              { label: 'RPM', val: lastVal.rpm.toLocaleString(), unit: '',    color: C.rpm },
              { label: 'AFR', val: lastVal.afr.toFixed(2),       unit: '',    color: C.afr },
              { label: 'BAT', val: lastVal.bat.toFixed(2),       unit: 'V',  color: C.bat },
              { label: 'EOT', val: lastVal.eot.toFixed(1),       unit: '°C', color: C.eot },
              { label: 'IAT', val: lastVal.iat.toFixed(1),       unit: '°C', color: C.iat },
            ].map(r => (
              <div key={r.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'rgba(0,50,120,0.45)', letterSpacing: '0.8px', fontWeight: 700 }}>{r.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: r.color, transition: 'color 0.3s', lineHeight: 1.1 }}>{r.val}{r.unit}</div>
              </div>
            ))}
          </div>
        )}

        {/* Kanan: toggle REF */}
        <button
          onClick={() => setShowRef(v => !v)}
          style={{
            padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
            background: showRef ? 'rgba(0,119,255,0.1)' : 'rgba(0,85,204,0.05)',
            border: `1px solid ${showRef ? 'rgba(0,119,255,0.35)' : 'rgba(0,85,204,0.15)'}`,
            color: showRef ? '#0077ff' : 'rgba(0,50,120,0.45)',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
            fontFamily: "'Exo 2', sans-serif", transition: 'all 0.2s'
          }}>
          {showRef ? 'REF ON' : 'REF OFF'}
        </button>
      </div>

      {/* ── Area Chart ──────────────────────────────────────── */}
      <div style={{
        flex: 1, zIndex: 1,
        display: 'flex', flexDirection: 'column', gap: '10px',
        overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 16px 16px 16px',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,119,255,0.3) transparent',
      }}>

        {/* Grid 2 kolom: Chart 1 + Chart 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

          {/* CHART 1: RPM + AFR */}
          <ChartCard
            title="RPM vs AFR — Korelasi Akselerasi"
            badge={lastVal ? `${lastVal.rpm.toLocaleString()} rpm` : '—'}
            badgeColor={C.rpm}
            delay={0}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.rpm} label="RPM" value={lastVal?.rpm.toLocaleString()} />
              <LegendItem color={C.afr} label="AFR" value={lastVal?.afr.toFixed(2)} />
            </div>
            <SensorChart
              label="RPM-AFR"
              height={160}
              showRefLines={showRef}
              datasets={[
                {
                  data: hist.rpm, color: C.rpm, min: 0, max: 8500,
                  refLines: [
                    { val: 900,  color: 'rgba(0,119,255,0.25)', dash: [4, 4] },
                    { val: 4000, color: 'rgba(224,123,0,0.2)',  dash: [3, 3] },
                  ]
                },
                {
                  data: hist.afr.map(v => ((v - 9) / 11) * 8500),
                  color: C.afr, min: 0, max: 8500,
                  refLines: [{ val: ((14.7 - 9) / 11) * 8500, color: 'rgba(224,123,0,0.35)', dash: [5, 3] }]
                }
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              AFR dinormalisasi ke skala RPM • garis putus = stoich 14.7
            </div>
          </ChartCard>

          {/* CHART 2: BAT vs RPM */}
          <ChartCard
            title="BAT vs RPM — Monitoring Alternator"
            badge={lastVal ? `${lastVal.bat.toFixed(2)}V` : '—'}
            badgeColor={lastVal && lastVal.bat >= 13.5 ? C.bat : lastVal && lastVal.bat < 12.5 ? C.red : '#e07b00'}
            delay={0.06}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.bat} label="BAT" value={lastVal?.bat.toFixed(2)} unit="V" />
              <LegendItem color={C.rpm} label="RPM" value={lastVal?.rpm.toLocaleString()} />
            </div>
            <SensorChart
              label="BAT-RPM"
              height={160}
              showRefLines={showRef}
              datasets={[
                {
                  data: hist.bat, color: C.bat, min: 10.5, max: 15.5,
                  refLines: [
                    { val: 13.5, color: 'rgba(0,168,90,0.4)',   dash: [5, 3] },
                    { val: 12.5, color: 'rgba(217,38,61,0.35)', dash: [3, 3] },
                  ]
                },
                {
                  data: hist.rpm.map(v => 10.5 + (v / 8500) * 5),
                  color: C.rpm + '80', min: 10.5, max: 15.5,
                }
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              Hijau = 13.5V batas charging • merah = 12.5V batas low
            </div>
          </ChartCard>
        </div>

        {/* Grid 2 kolom: Chart 3 + Chart 4 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

          {/* CHART 3: EOT + IAT */}
          <ChartCard
            title="EOT vs IAT — Manajemen Suhu"
            badge={lastVal ? `EOT ${lastVal.eot.toFixed(1)}°C` : '—'}
            badgeColor={lastVal && lastVal.eot > 100 ? C.red : lastVal && lastVal.eot > 85 ? '#e07b00' : C.eot}
            delay={0.12}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.eot} label="EOT" value={lastVal?.eot.toFixed(1)} unit="°C" />
              <LegendItem color={C.iat} label="IAT" value={lastVal?.iat.toFixed(1)} unit="°C" />
            </div>
            <SensorChart
              label="EOT-IAT"
              height={160}
              showRefLines={showRef}
              datasets={[
                {
                  data: hist.eot, color: C.eot, min: 30, max: 130,
                  refLines: [
                    { val: 70,  color: 'rgba(217,95,0,0.3)',  dash: [5, 3] },
                    { val: 110, color: 'rgba(217,38,61,0.4)', dash: [3, 3] },
                  ]
                },
                {
                  data: hist.iat, color: C.iat, min: 30, max: 130,
                  refLines: [{ val: 45, color: 'rgba(45,111,212,0.3)', dash: [4, 4] }]
                }
              ]}
            />
            <div style={{ fontSize: '10px', color: 'rgba(0,50,120,0.38)', marginTop: '5px', fontStyle: 'italic' }}>
              EOT ideal 70–110°C • IAT tinggi &gt;45°C = udara kurang padat
            </div>
          </ChartCard>

          {/* CHART 4: AFR Detail */}
          <ChartCard
            title="AFR — Air Fuel Ratio Detail"
            badge={(() => {
              if (!lastVal) return '—'
              const v = lastVal.afr
              return v < 12 ? 'KAYA' : v < 13.5 ? 'RICH' : v >= 14.5 && v <= 14.9 ? 'STOICH' : v < 14.5 ? '~STOICH' : v <= 16 ? 'LEAN' : 'MISKIN'
            })()}
            badgeColor={(() => {
              if (!lastVal) return '#555'
              const v = lastVal.afr
              return v >= 14.4 && v <= 15.0 ? C.bat : v > 16 || v < 12 ? C.red : '#e07b00'
            })()}
            delay={0.18}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <LegendItem color={C.afr} label="AFR" value={lastVal?.afr.toFixed(2)} />
            </div>
            <SensorChart
              label="AFR"
              height={160}
              showRefLines={showRef}
              datasets={[
                {
                  data: hist.afr, color: C.afr, min: 9, max: 20,
                  refLines: [
                    { val: 14.7, color: 'rgba(0,168,90,0.5)',  dash: [5, 3] },
                    { val: 16.0, color: 'rgba(217,38,61,0.4)', dash: [3, 3] },
                    { val: 12.0, color: 'rgba(217,95,0,0.35)', dash: [4, 3] },
                  ]
                }
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              {['9', 'KAYA 12', 'STOICH 14.7', 'LEAN 16', '20'].map(l => (
                <span key={l} style={{ fontSize: '9px', color: 'rgba(0,50,120,0.35)', fontStyle: 'italic' }}>{l}</span>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* Analisis Tren — full width */}
        <div style={{
          fontSize: '11px', color: 'rgba(0,55,140,0.5)',
          letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase',
          paddingLeft: '2px', paddingTop: '4px'
        }}>
          Analisis Tren ({hist.rpm.length} sample)
        </div>

        {trends.map((t, i) => {
          const s = trendLevelStyle[t.level] || trendLevelStyle.ok
          return (
            <div key={i} style={{
              background: s.bg, border: `1.5px solid ${s.border}`,
              borderRadius: '12px', padding: '10px 14px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              animation: `cardReveal 0.4s cubic-bezier(0.34,1.56,0.64,1) both`,
              animationDelay: `${0.05 * i + 0.24}s`
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{t.icon}</span>
              <div style={{ fontSize: 'clamp(11px,1.2vw,13px)', color: 'rgba(0,40,100,0.82)', fontWeight: 700, fontStyle: 'italic', lineHeight: 1.5 }}>
                {t.text}
              </div>
            </div>
          )
        })}

        {!connected && hist.rpm.length === 0 && (
          <div style={{
            padding: '16px 18px', borderRadius: '12px',
            background: 'rgba(224,123,0,0.06)', border: '1px solid rgba(224,123,0,0.2)',
            fontSize: '12px', color: 'rgba(0,50,120,0.65)', fontStyle: 'italic', lineHeight: 1.7
          }}>
            ⚠ Tidak terhubung Firebase.<br />
            Pastikan ESP32 aktif dan mengirim data ke <code style={{ color: '#e07b00' }}>{FB_PATH}</code>
          </div>
        )}
      </div>
    </div>
  )
}

export default Grafik