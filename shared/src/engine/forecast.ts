export interface Forecast {
  trials: number
  medianPaise: number
  p10Paise: number
  p90Paise: number
  shortfallShare: number
  daysProjected: number
  sampleDays: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function forecastMonthEnd(
  dailyPaise: number[],
  poolLeftPaise: number,
  daysAfterToday: number,
): Forecast | null {
  const history = dailyPaise.filter((value) => Number.isFinite(value))
  if (history.length < 7) return null
  if (daysAfterToday <= 0) {
    return {
      trials: 0,
      medianPaise: poolLeftPaise,
      p10Paise: poolLeftPaise,
      p90Paise: poolLeftPaise,
      shortfallShare: poolLeftPaise < 0 ? 1 : 0,
      daysProjected: 0,
      sampleDays: history.length,
    }
  }
  const seed = Math.abs(Math.round(poolLeftPaise) + history.length * 97 + daysAfterToday * 13)
  const random = mulberry32(seed || 1)
  const ends: number[] = []
  for (let trial = 0; trial < 1000; trial += 1) {
    let spend = 0
    for (let day = 0; day < daysAfterToday; day += 1) {
      spend += history[Math.floor(random() * history.length)]
    }
    ends.push(poolLeftPaise - spend)
  }
  ends.sort((a, b) => a - b)
  const short = ends.filter((value) => value < 0).length
  return {
    trials: 1000,
    medianPaise: ends[500],
    p10Paise: ends[100],
    p90Paise: ends[900],
    shortfallShare: short / 1000,
    daysProjected: daysAfterToday,
    sampleDays: history.length,
  }
}
