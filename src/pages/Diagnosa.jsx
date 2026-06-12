import { useState, useEffect } from 'react'
import { initializeApp, getApps }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'

const firebaseConfig = {
  apiKey:      "AIzaSyBAaslSPUuviuQYy80FbuP9V6C9Gtcn_0g",
  databaseURL: "https://dalogecu-default-rtdb.firebaseio.com/"
}
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const _db  = getDatabase(_app)

const FB_PATH = '/ecu/live'

// ── Warna helper — disesuaikan untuk background TERANG ────────
const colors = {
  cyan:   '#0077aa',   // biru gelap (dari cyan terang)
  green:  '#007a3d',   // hijau gelap
  yellow: '#b07800',   // kuning gelap
  red:    '#cc1c3a',   // merah gelap
  blue:   '#2255aa',   // biru sedang
  text:   'rgba(10,20,60,0.85)',   // teks utama gelap
  dim:    'rgba(10,20,60,0.45)',   // teks redup gelap
}

// ════════════════════════════════════════════════════════════
//  EVALUASI KORELASI SENSOR
// ════════════════════════════════════════════════════════════
function evaluateCorrelations(s) {
  const results = []

  // 1. AFR vs EOT
  {
    const afrLean   = s.afr > 16.0
    const eotHigh   = s.eot > 100
    const afrStoich = s.afr >= 14.4 && s.afr <= 15.0
    let status, level, detail
    if (afrLean && eotHigh) {
      status = 'KRITIS'; level = 'danger'
      detail = `AFR ${s.afr.toFixed(2)} (lean) + EOT ${s.eot.toFixed(1)}°C — campuran miskin membakar lebih panas, risiko overheat tinggi`
    } else if (afrLean && s.eot > 85) {
      status = 'PERHATIAN'; level = 'warn'
      detail = `AFR ${s.afr.toFixed(2)} lean, EOT mulai naik (${s.eot.toFixed(1)}°C). Waspadai overheating`
    } else if (s.afr < 12.0 && s.eot < 70) {
      status = 'PERHATIAN'; level = 'warn'
      detail = `AFR ${s.afr.toFixed(2)} terlalu kaya, mesin belum panas (${s.eot.toFixed(1)}°C) — cek choke atau injeksi saat cold start`
    } else if (afrStoich && s.eot >= 70 && s.eot <= 110) {
      status = 'NORMAL'; level = 'ok'
      detail = `AFR ${s.afr.toFixed(2)} stoikiometri, EOT ${s.eot.toFixed(1)}°C — campuran dan suhu dalam batas ideal`
    } else {
      status = 'OK'; level = 'ok'
      detail = `AFR ${s.afr.toFixed(2)}, EOT ${s.eot.toFixed(1)}°C — tidak ada anomali terdeteksi`
    }
    results.push({
      id: 'afr-eot', title: 'AFR vs EOT', icon: '🌡',
      subtitle: 'Campuran bahan bakar terhadap suhu oli mesin',
      status, level, detail,
      values: [
        { label: 'AFR', val: s.afr.toFixed(2),       color: s.afr >= 14.4 && s.afr <= 15.0 ? colors.green : s.afr > 16 ? colors.red : colors.yellow },
        { label: 'EOT', val: `${s.eot.toFixed(1)}°C`, color: s.eot > 100 ? colors.red : s.eot > 85 ? colors.yellow : colors.cyan },
      ],
      bars: [
        { label: 'AFR', pct: Math.min(100, Math.max(0, ((s.afr - 9) / 11) * 100)), color: s.afr >= 14.4 && s.afr <= 15.0 ? colors.green : s.afr > 16 ? colors.red : colors.yellow },
        { label: 'EOT', pct: Math.min(100, (s.eot / 130) * 100), color: s.eot > 100 ? colors.red : s.eot > 85 ? colors.yellow : colors.cyan },
      ],
      ref: 'AFR ideal: 14.4–14.9 • EOT ideal: 70–110°C'
    })
  }

  // 2. RPM vs AFR
  {
    const highLoad = s.rpm > 4000
    const afrHigh  = s.afr > 14.5
    const afrRich  = s.afr >= 12.0 && s.afr <= 13.5
    let status, level, detail
    if (highLoad && afrHigh) {
      status = 'MASALAH'; level = 'danger'
      detail = `RPM ${s.rpm.toLocaleString()} (tinggi) tapi AFR ${s.afr.toFixed(2)} tidak turun — injektor lemah atau sensor TPS/MAP bermasalah`
    } else if (highLoad && afrRich) {
      status = 'NORMAL'; level = 'ok'
      detail = `RPM ${s.rpm.toLocaleString()}, AFR ${s.afr.toFixed(2)} — enrichment saat akselerasi berjalan normal`
    } else if (s.rpm < 1500 && s.afr < 13.0) {
      status = 'PERHATIAN'; level = 'warn'
      detail = `Idle RPM ${s.rpm.toLocaleString()}, AFR ${s.afr.toFixed(2)} terlalu kaya — kemungkinan ISC atau injektor bocor`
    } else {
      status = 'OK'; level = 'ok'
      detail = `RPM ${s.rpm.toLocaleString()}, AFR ${s.afr.toFixed(2)} — korelasi dalam batas normal`
    }
    results.push({
      id: 'rpm-afr', title: 'RPM vs AFR', icon: '⚡',
      subtitle: 'Beban mesin terhadap rasio campuran',
      status, level, detail,
      values: [
        { label: 'RPM', val: s.rpm.toLocaleString(), color: s.rpm > 6000 ? colors.red : s.rpm > 3000 ? colors.yellow : colors.cyan },
        { label: 'AFR', val: s.afr.toFixed(2),       color: s.afr >= 14.4 && s.afr <= 15.0 ? colors.green : s.afr > 16 ? colors.red : colors.yellow },
      ],
      bars: [
        { label: 'RPM', pct: Math.min(100, (s.rpm / 8500) * 100), color: s.rpm > 6000 ? colors.red : s.rpm > 3000 ? colors.yellow : colors.cyan },
        { label: 'AFR', pct: Math.min(100, Math.max(0, ((s.afr - 9) / 11) * 100)), color: s.afr >= 14.4 && s.afr <= 15.0 ? colors.green : s.afr > 16 ? colors.red : colors.yellow },
      ],
      ref: 'Akselerasi: AFR turun ke 12–13 (enrichment) • Idle: 14.0–14.9'
    })
  }

  // 3. BAT vs RPM
  {
    const engineOn    = s.rpm > 900
    const batCharging = s.bat >= 13.5 && s.bat <= 14.8
    const batLow      = s.bat < 12.5
    const batNoCharge = s.bat < 13.4 && engineOn
    let status, level, detail
    if (engineOn && batNoCharge) {
      status = 'MASALAH'; level = 'danger'
      detail = `Mesin hidup (${s.rpm.toLocaleString()} rpm) tapi baterai ${s.bat.toFixed(2)}V — alternator atau regulator tegangan bermasalah`
    } else if (!engineOn && batLow) {
      status = 'KRITIS'; level = 'danger'
      detail = `Mesin mati, baterai ${s.bat.toFixed(2)}V sangat rendah — kemungkinan aki soak atau ada kebocoran arus`
    } else if (engineOn && batCharging) {
      status = 'NORMAL'; level = 'ok'
      detail = `Mesin hidup (${s.rpm.toLocaleString()} rpm), baterai ${s.bat.toFixed(2)}V — alternator charging normal`
    } else if (!engineOn) {
      status = 'STANDBY'; level = 'info'
      detail = `Mesin mati, baterai ${s.bat.toFixed(2)}V — tegangan dalam kondisi standby`
    } else {
      status = 'OK'; level = 'ok'
      detail = `RPM ${s.rpm.toLocaleString()}, baterai ${s.bat.toFixed(2)}V — tidak ada anomali`
    }
    results.push({
      id: 'bat-rpm', title: 'BAT vs RPM', icon: '🔋',
      subtitle: 'Tegangan aki terhadap kondisi pengisian alternator',
      status, level, detail,
      values: [
        { label: 'BAT', val: `${s.bat.toFixed(2)}V`, color: s.bat < 12.0 ? colors.red : s.bat < 13.5 ? colors.yellow : colors.green },
        { label: 'RPM', val: s.rpm.toLocaleString(),  color: s.rpm < 900 ? colors.dim : colors.cyan },
      ],
      bars: [
        { label: 'BAT', pct: Math.min(100, Math.max(0, ((s.bat - 10) / 6) * 100)), color: s.bat < 12.0 ? colors.red : s.bat < 13.5 ? colors.yellow : colors.green },
        { label: 'RPM', pct: Math.min(100, (s.rpm / 8500) * 100), color: colors.cyan },
      ],
      ref: 'Mesin hidup: 13.5–14.8V (alternator aktif) • Standby: 12.0–12.8V'
    })
  }

  // 4. IAT vs AFR
  {
    const iatHigh   = s.iat > 45
    const afrLean   = s.afr > 15.2
    const iatNormal = s.iat >= 20 && s.iat <= 45
    const ecuCompOk = iatHigh && s.afr >= 14.2 && s.afr <= 15.2
    let status, level, detail
    if (iatHigh && afrLean) {
      status = 'MASALAH'; level = 'danger'
      detail = `IAT ${s.iat.toFixed(1)}°C tinggi, ECU gagal kompensasi — AFR ${s.afr.toFixed(2)} lean (seharusnya ECU tambah injeksi)`
    } else if (ecuCompOk) {
      status = 'NORMAL'; level = 'ok'
      detail = `IAT ${s.iat.toFixed(1)}°C tinggi, ECU berhasil kompensasi — AFR ${s.afr.toFixed(2)} tetap mendekati stoikiometri`
    } else if (iatNormal) {
      status = 'NORMAL'; level = 'ok'
      detail = `IAT ${s.iat.toFixed(1)}°C dalam kisaran normal, AFR ${s.afr.toFixed(2)} — tidak perlu koreksi besar`
    } else if (s.iat < 20) {
      status = 'INFO'; level = 'info'
      detail = `IAT ${s.iat.toFixed(1)}°C dingin — ECU akan memperkaya campuran (normal saat cold start)`
    } else {
      status = 'OK'; level = 'ok'
      detail = `IAT ${s.iat.toFixed(1)}°C, AFR ${s.afr.toFixed(2)} — korelasi baik`
    }
    results.push({
      id: 'iat-afr', title: 'IAT vs AFR', icon: '💨',
      subtitle: 'Suhu udara masuk terhadap koreksi campuran ECU',
      status, level, detail,
      values: [
        { label: 'IAT', val: `${s.iat.toFixed(1)}°C`, color: s.iat > 55 ? colors.red : s.iat > 45 ? colors.yellow : colors.blue },
        { label: 'AFR', val: s.afr.toFixed(2),         color: s.afr >= 14.2 && s.afr <= 15.2 ? colors.green : s.afr > 15.2 ? colors.red : colors.yellow },
      ],
      bars: [
        { label: 'IAT', pct: Math.min(100, (s.iat / 70) * 100), color: s.iat > 55 ? colors.red : s.iat > 45 ? colors.yellow : colors.blue },
        { label: 'AFR', pct: Math.min(100, Math.max(0, ((s.afr - 9) / 11) * 100)), color: s.afr >= 14.2 && s.afr <= 15.2 ? colors.green : s.afr > 15.2 ? colors.red : colors.yellow },
      ],
      ref: 'IAT tinggi → udara kurang padat → ECU kompensasi tambah injeksi → AFR tetap ~14.7'
    })
  }

  return results
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN UI
// ════════════════════════════════════════════════════════════
function DualBar({ bars }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '8px' }}>
      {bars.map(b => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* label bar — warna gelap */}
          <span style={{ fontSize: '9px', fontWeight: 800, color: colors.dim, letterSpacing: '0.8px', minWidth: '24px' }}>{b.label}</span>
          {/* track bar — abu terang */}
          <div style={{ flex: 1, height: '4px', borderRadius: '3px', background: 'rgba(0,20,80,0.1)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${b.pct}%`, borderRadius: '3px',
              background: b.color, boxShadow: `0 0 6px ${b.color}55`,
              transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)'
            }} />
          </div>
          {/* persentase — warna gelap */}
          <span style={{ fontSize: '9px', color: colors.dim, minWidth: '28px', textAlign: 'right' }}>{Math.round(b.pct)}%</span>
        </div>
      ))}
    </div>
  )
}

function CorrelationCard({ corr, index }) {
  const levelStyle = {
    danger: { bg: 'rgba(204,28,58,0.06)',  border: 'rgba(204,28,58,0.25)',  badge: colors.red    },
    warn:   { bg: 'rgba(176,120,0,0.06)',  border: 'rgba(176,120,0,0.25)',  badge: colors.yellow },
    ok:     { bg: 'rgba(0,122,61,0.05)',   border: 'rgba(0,122,61,0.18)',   badge: colors.green  },
    info:   { bg: 'rgba(34,85,170,0.05)',  border: 'rgba(34,85,170,0.18)', badge: colors.blue   },
  }
  const s = levelStyle[corr.level] || levelStyle.ok

  return (
    <div style={{
      background: s.bg, border: `1.5px solid ${s.border}`,
      borderRadius: '14px', padding: '14px 16px',
      animation: `cardReveal 0.4s cubic-bezier(0.34,1.56,0.64,1) both`,
      animationDelay: `${0.07 * index}s`,
      transition: 'border-color 0.3s, background 0.3s'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{ fontSize: '15px' }}>{corr.icon}</span>
            {/* judul kartu — GELAP */}
            <span style={{ fontSize: 'clamp(13px,1.4vw,15px)', fontWeight: 800, fontStyle: 'italic', color: colors.text, letterSpacing: '0.03em' }}>{corr.title}</span>
          </div>
          {/* subtitle — abu gelap */}
          <div style={{ fontSize: '11px', color: colors.dim, fontStyle: 'italic', paddingLeft: '23px' }}>
            {corr.subtitle}
          </div>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 900, letterSpacing: '1.5px',
          padding: '3px 10px', borderRadius: '6px',
          background: `${s.badge}18`, border: `1px solid ${s.badge}55`,
          color: s.badge, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '12px'
        }}>{corr.status}</span>
      </div>

      {/* Nilai sensor */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        {corr.values.map(v => (
          <div key={v.label} style={{
            flex: 1, padding: '7px 10px', borderRadius: '8px',
            background: 'rgba(0,20,80,0.04)', border: '1px solid rgba(0,20,80,0.10)'
          }}>
            {/* label kolom — abu gelap */}
            <div style={{ fontSize: '10px', color: colors.dim, letterSpacing: '0.8px', fontWeight: 700 }}>{v.label}</div>
            <div style={{ fontSize: 'clamp(14px,1.8vw,20px)', fontWeight: 800, color: v.color, transition: 'color 0.3s', marginTop: '2px' }}>{v.val}</div>
          </div>
        ))}
      </div>

      <DualBar bars={corr.bars} />

      {/* Deskripsi analisis — GELAP */}
      <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,20,80,0.04)', border: '1px solid rgba(0,20,80,0.08)' }}>
        <div style={{ fontSize: 'clamp(11px,1.2vw,13px)', color: colors.text, fontStyle: 'italic', fontWeight: 600, lineHeight: 1.5 }}>
          {corr.detail}
        </div>
      </div>

      {/* referensi — abu gelap */}
      <div style={{ fontSize: '10px', color: colors.dim, marginTop: '7px', fontStyle: 'italic', lineHeight: 1.4 }}>
        {corr.ref}
      </div>
    </div>
  )
}

function HealthScore({ corrs }) {
  const weights = { danger: 0, warn: 60, ok: 100, info: 85 }
  const avg     = corrs.reduce((a, c) => a + (weights[c.level] ?? 100), 0) / corrs.length
  const color   = avg < 40 ? colors.red : avg < 70 ? colors.yellow : colors.green
  const label   = avg < 40 ? 'Kritis' : avg < 70 ? 'Perhatian' : avg < 90 ? 'Baik' : 'Prima'
  return (
    <div style={{
      padding: '12px 14px', borderRadius: '12px',
      background: `${color}10`, border: `1.5px solid ${color}50`,
      textAlign: 'center', minWidth: '110px'
    }}>
      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '34px', lineHeight: 1, fontWeight: 900, color }}>
        {Math.round(avg)}
      </div>
      <div style={{ fontSize: '10px', color, fontWeight: 800, fontStyle: 'italic', marginTop: '4px', letterSpacing: '0.5px' }}>{label}</div>
      {/* "Health Score" — abu gelap agar terbaca di bg putih */}
      <div style={{ fontSize: '9px', color: colors.dim, marginTop: '2px' }}>Health Score</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  KOMPONEN UTAMA
// ════════════════════════════════════════════════════════════
function Diagnosa() {
  const [connected,  setConnected]  = useState(false)
  const [lastUpdate, setLastUpdate] = useState('--')
  const [sensors,    setSensors]    = useState({
    rpm: 0, bat: 12.8, eot: 75, iat: 35, afr: 14.7
  })

  useEffect(() => {
    const liveRef = ref(_db, FB_PATH)
    const unsub   = onValue(
      liveRef,
      (snap) => {
        if (!snap.exists()) return
        const d = snap.val()
        setSensors({
          rpm: Number(d.rpm ?? 0),
          bat: Number(d.bat ?? 12.8),
          eot: Number(d.eot ?? 75),
          iat: Number(d.iat ?? 35),
          afr: Number(d.afr ?? 14.7),
        })
        setConnected(true)
        setLastUpdate(new Date().toLocaleTimeString('id-ID'))
      },
      (err) => {
        console.error('[Firebase] Diagnosa error:', err)
        setConnected(false)
      }
    )
    return () => unsub()
  }, [])

  const corrs       = evaluateCorrelations(sensors)
  const dangerCount = corrs.filter(c => c.level === 'danger').length
  const warnCount   = corrs.filter(c => c.level === 'warn').length

  return (
    <div className="page-container" style={{ alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="checker-board"><div className="checker-grid"></div></div>

      {/* ── Panel Kiri ──────────────────────────────────────── */}
      <div className="left-section" style={{ justifyContent: 'flex-start', paddingTop: '8px' }}>
        <div className="brand-title">TI TECH.</div>

        {/* Koneksi Firebase */}
        <div style={{
          marginTop: '14px', padding: '10px 12px', borderRadius: '8px',
          background: connected ? 'rgba(0,122,61,0.07)' : 'rgba(204,28,58,0.07)',
          border: `1px solid ${connected ? 'rgba(0,122,61,0.3)' : 'rgba(204,28,58,0.3)'}`,
          transition: 'all 0.3s'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px',
            color: connected ? colors.green : colors.red }}>
            {connected ? '● LIVE' : '○ OFFLINE'}
          </div>
          {connected && (
            /* timestamp — gelap */
            <div style={{ fontSize: '10px', marginTop: '3px', color: colors.dim }}>
              {lastUpdate}
            </div>
          )}
          {!connected && (
            <div style={{ fontSize: '10px', color: colors.red, opacity: 0.8, marginTop: '3px' }}>
              Cek koneksi ESP32
            </div>
          )}
        </div>

        {/* Health Score */}
        <div style={{ marginTop: '12px' }}>
          <HealthScore corrs={corrs} />
        </div>

        {/* Ringkasan Alert */}
        <div style={{
          marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(0,20,80,0.04)', border: '1px solid rgba(0,20,80,0.10)'
        }}>
          {/* label ALERT — gelap */}
          <div style={{ fontSize: '10px', color: colors.dim, letterSpacing: '1px', marginBottom: '8px', fontWeight: 700 }}>ALERT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: colors.red, fontWeight: 700 }}>Kritis</span>
              {/* angka 0 — abu gelap; > 0 — merah */}
              <span style={{ fontSize: '16px', fontWeight: 900, color: dangerCount > 0 ? colors.red : colors.dim }}>
                {dangerCount}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: colors.yellow, fontWeight: 700 }}>Perhatian</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: warnCount > 0 ? colors.yellow : colors.dim }}>
                {warnCount}
              </span>
            </div>
          </div>
        </div>

        {/* Info — abu gelap */}
        <div style={{
          marginTop: '12px', fontSize: '10px',
          color: colors.dim, fontStyle: 'italic', lineHeight: 1.6, maxWidth: '120px'
        }}>
          Analisis korelasi sensor real-time dari ECU Juken 5++
        </div>

        {/* Debug path — abu sangat gelap */}
        <div style={{
          marginTop: '8px', padding: '5px 8px', borderRadius: '6px',
          background: 'rgba(0,20,80,0.03)', border: '1px solid rgba(0,20,80,0.08)'
        }}>
          <div style={{ fontSize: '9px', color: 'rgba(0,20,80,0.35)', fontStyle: 'italic' }}>
            db: {FB_PATH}
          </div>
        </div>
      </div>

      {/* ── Panel Kanan ─────────────────────────────────────── */}
      <div className="right-section diagnosa-section" style={{
        gap: '10px', justifyContent: 'flex-start',
        paddingTop: '8px', paddingBottom: '24px', overflowY: 'auto'
      }}>
        {/* judul seksi — gelap */}
        <div style={{
          fontSize: '11px', color: colors.dim,
          letterSpacing: '0.12em', fontWeight: 800, textTransform: 'uppercase',
          paddingLeft: '2px', paddingBottom: '4px'
        }}>
          Analisis Korelasi Sensor — Real-time
        </div>

        {corrs.map((corr, i) => (
          <CorrelationCard key={corr.id} corr={corr} index={i} />
        ))}

        {!connected && (
          <div style={{
            padding: '14px 18px', borderRadius: '12px',
            background: 'rgba(176,120,0,0.06)', border: '1px solid rgba(176,120,0,0.2)',
            fontSize: '12px', color: colors.text, fontStyle: 'italic', lineHeight: 1.6
          }}>
            ⚠ Tidak terhubung Firebase — menampilkan nilai default.<br />
            Pastikan ESP32 aktif dan mengirim data ke <code style={{ color: colors.yellow }}>{FB_PATH}</code>
          </div>
        )}
      </div>
    </div>
  )
}

export default Diagnosa