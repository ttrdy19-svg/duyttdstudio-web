(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DuyKyAmWeb = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SAMPLE_RATE = 22050;
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NOTE_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const KEY_NAMES = ['Đô', 'Đô thăng', 'Rê', 'Mi giáng', 'Mi', 'Fa', 'Fa thăng', 'Sol', 'La giáng', 'La', 'Si giáng', 'Si'];
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const QUALITIES = [
    { id: 'maj', suffix: '', intervals: [0, 4, 7], name: 'Trưởng' },
    { id: 'min', suffix: 'm', intervals: [0, 3, 7], name: 'Thứ' },
    { id: '7', suffix: '7', intervals: [0, 4, 7, 10], name: 'Bảy' },
    { id: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11], name: 'Trưởng bảy' },
    { id: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10], name: 'Thứ bảy' },
    { id: 'sus4', suffix: 'sus4', intervals: [0, 5, 7], name: 'Treo 4' },
    { id: 'dim', suffix: 'dim', intervals: [0, 3, 6], name: 'Giảm' },
  ];
  const QUALITY_BY_ID = Object.fromEntries(QUALITIES.map(item => [item.id, item]));
  const OPEN_SHAPES = {
    maj: { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
    min: { 2: 'Dm', 4: 'Em', 9: 'Am' },
    '7': { 2: 'D7', 4: 'E7', 7: 'G7', 9: 'A7', 11: 'B7' },
    maj7: { 0: 'Cmaj7', 4: 'Emaj7', 9: 'Amaj7' },
    m7: { 2: 'Dm7', 4: 'Em7', 9: 'Am7' },
    sus4: { 2: 'Dsus4', 7: 'Gsus4' },
    dim: {},
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function mod(value, size) { return ((value % size) + size) % size; }
  function escapeXml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  }
  function powerOfTwo(value) { return value > 0 && (value & (value - 1)) === 0; }

  function fft(real, imag) {
    const length = real.length;
    if (!powerOfTwo(length) || imag.length !== length) throw new RangeError('FFT cần hai mảng cùng độ dài lũy thừa của 2.');
    for (let i = 1, j = 0; i < length; i++) {
      let bit = length >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let size = 2; size <= length; size <<= 1) {
      const angle = -2 * Math.PI / size;
      const wr0 = Math.cos(angle); const wi0 = Math.sin(angle);
      for (let start = 0; start < length; start += size) {
        let wr = 1; let wi = 0;
        const half = size >> 1;
        for (let offset = 0; offset < half; offset++) {
          const even = start + offset; const odd = even + half;
          const tr = wr * real[odd] - wi * imag[odd];
          const ti = wr * imag[odd] + wi * real[odd];
          real[odd] = real[even] - tr; imag[odd] = imag[even] - ti;
          real[even] += tr; imag[even] += ti;
          const nextWr = wr * wr0 - wi * wi0;
          wi = wr * wi0 + wi * wr0; wr = nextWr;
        }
      }
    }
    return { real, imag };
  }

  function fftFrame(samples, start, size, sampleRate) {
    const real = new Float64Array(size); const imag = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const sample = samples[start + i] || 0;
      real[i] = sample * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    }
    fft(real, imag);
    const chroma = new Float64Array(12); const bass = new Float64Array(12); const spectrum = new Float64Array(size >> 1);
    for (let bin = 1; bin < spectrum.length; bin++) {
      const magnitude = Math.hypot(real[bin], imag[bin]);
      spectrum[bin] = magnitude;
      const hz = bin * sampleRate / size;
      if (hz < 65.406 || hz > 1975.53) continue;
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      if (midi >= 36 && midi <= 95) {
        chroma[mod(midi, 12)] += magnitude * magnitude;
        if (midi <= 71) bass[mod(midi, 12)] += magnitude * magnitude;
      }
    }
    return { chroma, bass, spectrum };
  }

  function correlation(left, right) {
    let sumLeft = 0; let sumRight = 0;
    for (let i = 0; i < 12; i++) { sumLeft += left[i]; sumRight += right[i]; }
    const meanLeft = sumLeft / 12; const meanRight = sumRight / 12;
    let numerator = 0; let squareLeft = 0; let squareRight = 0;
    for (let i = 0; i < 12; i++) {
      const a = left[i] - meanLeft; const b = right[i] - meanRight;
      numerator += a * b; squareLeft += a * a; squareRight += b * b;
    }
    return numerator / Math.sqrt((squareLeft * squareRight) || 1);
  }

  function identifyKey(chroma) {
    let best = { root: 0, mode: 'major', score: -Infinity };
    for (let root = 0; root < 12; root++) {
      const rotated = chroma.map((_, index) => chroma[mod(index + root, 12)]);
      const major = correlation(rotated, MAJOR_PROFILE);
      const minor = correlation(rotated, MINOR_PROFILE);
      if (major > best.score) best = { root, mode: 'major', score: major };
      if (minor > best.score) best = { root, mode: 'minor', score: minor };
    }
    const rootName = NOTE_NAMES[best.root];
    const relative = best.mode === 'major' ? NOTE_NAMES[mod(best.root + 9, 12)] : NOTE_NAMES[mod(best.root + 3, 12)];
    return {
      root: best.root, rootName, mode: best.mode, tonic: rootName + (best.mode === 'minor' ? 'm' : ''),
      name: `${KEY_NAMES[best.root]} ${best.mode === 'major' ? 'trưởng' : 'thứ'} (${rootName}${best.mode === 'minor' ? 'm' : ''})`,
      relative, relativeName: `${relative}${best.mode === 'major' ? 'm' : ''}`, score: best.score,
    };
  }

  function analyzeTempo(samples, sampleRate) {
    const hop = 256; const frameSize = 1024;
    const limit = Math.min(samples.length, sampleRate * 180);
    const previous = new Float64Array(frameSize >> 1);
    const flux = [];
    for (let start = 0; start + frameSize <= limit; start += hop) {
      const { spectrum } = fftFrame(samples, start, frameSize, sampleRate);
      let value = 0;
      for (let bin = 2; bin < spectrum.length; bin++) {
        const current = Math.log1p(spectrum[bin]);
        value += Math.max(0, current - previous[bin]);
        previous[bin] = current;
      }
      flux.push(value);
    }
    if (flux.length < 12) return { bpm: 120, beatSec: 0.5, confidence: 0 };
    const mean = flux.reduce((sum, value) => sum + value, 0) / flux.length;
    for (let i = 0; i < flux.length; i++) flux[i] = Math.max(0, flux[i] - mean * 0.55);
    const minLag = Math.max(1, Math.floor((60 / 180) * sampleRate / hop));
    const maxLag = Math.min(Math.ceil((60 / 60) * sampleRate / hop), Math.floor(flux.length / 2));
    let bestLag = Math.round((60 / 120) * sampleRate / hop); let bestScore = -Infinity; let peak = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0; let energyA = 0; let energyB = 0;
      for (let i = lag; i < flux.length; i++) {
        const a = flux[i]; const b = flux[i - lag];
        sum += a * b; energyA += a * a; energyB += b * b;
      }
      const score = sum / Math.sqrt((energyA * energyB) || 1);
      const bpm = 60 * sampleRate / (hop * lag);
      const tempoPrior = 1 + 0.035 * Math.exp(-Math.pow(Math.log(bpm / 120), 2) / 0.45);
      const favored = score * tempoPrior;
      if (favored > bestScore) { bestScore = favored; bestLag = lag; peak = score; }
    }
    const rawBpm = 60 * sampleRate / (hop * bestLag);
    let bpm = clamp(rawBpm, 60, 180);
    if (bpm > 90 && bpm < 150) bpm = Math.round(bpm);
    else bpm = Math.round(bpm * 10) / 10;
    return { bpm, beatSec: 60 / bpm, confidence: clamp(peak, 0, 1) };
  }

  function diatonicChord(root, qualityId, key) {
    const intervals = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const degree = intervals.indexOf(mod(root - key.root, 12));
    if (degree < 0) return false;
    return (degree === 6 && qualityId === 'dim') ||
      (degree === 1 || degree === 2 || degree === 5 ? qualityId === 'min' : false) ||
      ([0, 3, 4].includes(degree) && qualityId === 'maj');
  }

  function chordCandidates(chroma, key) {
    const total = chroma.reduce((sum, value) => sum + value, 0) || 1;
    const normalized = chroma.map(value => value / total);
    return QUALITIES.flatMap(quality => NOTE_NAMES.map((name, root) => {
      const tones = new Set(quality.intervals.map(interval => mod(root + interval, 12)));
      let score = 0;
      for (let pc = 0; pc < 12; pc++) score += normalized[pc] * (tones.has(pc) ? 1 : -0.42);
      score += normalized[root] * 0.5;
      if (diatonicChord(root, quality.id, key)) score += 0.045;
      if (['7', 'maj7', 'm7'].includes(quality.id)) score -= 0.12;
      return { root, quality: quality.id, chord: name + quality.suffix, score };
    })).sort((a, b) => b.score - a.score);
  }

  function chooseChordSequence(rows, key) {
    if (!rows.length) return [];
    const candidates = rows.map(chroma => chordCandidates(chroma, key).slice(0, 18));
    let states = candidates[0].map(item => ({ ...item, path: [item], score: item.score }));
    for (let bar = 1; bar < candidates.length; bar++) {
      states = candidates[bar].map(current => {
        let prior = states[0]; let score = -Infinity;
        for (const previous of states) {
          const next = previous.score + current.score - (previous.chord === current.chord ? 0 : 0.035);
          if (next > score) { score = next; prior = previous; }
        }
        return { ...current, score, path: [...prior.path, current] };
      });
    }
    const best = states.reduce((left, right) => left.score >= right.score ? left : right);
    return best.path;
  }

  function midiName(midi) {
    const rounded = Math.round(midi);
    return NOTE_SHARP[mod(rounded, 12)] + (Math.floor(rounded / 12) - 1);
  }

  function staffPosition(midi) {
    const letterSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const octave = Math.floor(midi / 12) - 1;
    return octave * 7 + letterSteps[mod(midi, 12)];
  }

  function jianpu(midi, key) {
    const modeSteps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const offset = mod(midi - key.root, 12);
    let degree = modeSteps.findIndex(value => value === offset);
    let accidental = '';
    if (degree < 0) {
      degree = modeSteps.reduce((best, value, index) => Math.abs(value - offset) < Math.abs(modeSteps[best] - offset) ? index : best, 0);
      accidental = offset - modeSteps[degree] > 0 ? '♯' : '♭';
    }
    const tonicMidi = key.root + 60;
    const octave = Math.round((midi - tonicMidi - modeSteps[degree]) / 12);
    const dot = octave > 0 ? '\u0307'.repeat(Math.min(2, octave)) : octave < 0 ? '\u0323'.repeat(Math.min(2, -octave)) : '';
    return accidental + String(degree + 1) + dot;
  }

  function yinFrame(samples, center, sampleRate) {
    const size = 2048; const start = clamp(Math.floor(center - size / 2), 0, Math.max(0, samples.length - size));
    if (start + size > samples.length) return null;
    let energy = 0;
    for (let i = 0; i < size; i++) energy += samples[start + i] * samples[start + i];
    const rms = Math.sqrt(energy / size);
    if (rms < 0.004) return { midi: null, rms };
    const minLag = Math.floor(sampleRate / 1046); const maxLag = Math.min(Math.ceil(sampleRate / 65), size >> 1);
    const difference = new Float64Array(maxLag + 1); let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < size - lag; i += 2) {
        const delta = samples[start + i] - samples[start + i + lag];
        sum += delta * delta;
      }
      difference[lag] = sum; running += sum;
    }
    let cumulative = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      cumulative += difference[lag];
      difference[lag] = difference[lag] * lag / (cumulative || 1);
    }
    let bestLag = 0; let best = 1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (difference[lag] < best) { best = difference[lag]; bestLag = lag; }
      if (difference[lag] < 0.16) {
        while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag++;
        bestLag = lag; best = difference[lag]; break;
      }
    }
    if (!bestLag || best > 0.36) return { midi: null, rms };
    const left = difference[bestLag - 1] || difference[bestLag]; const middle = difference[bestLag]; const right = difference[bestLag + 1] || middle;
    const denominator = left - 2 * middle + right;
    const refined = bestLag + (denominator ? 0.5 * (left - right) / denominator : 0);
    const hz = sampleRate / refined;
    if (hz < 65 || hz > 1046) return { midi: null, rms };
    return { midi: 69 + 12 * Math.log2(hz / 440), rms, confidence: 1 - best };
  }

  function detectMelody(samples, sampleRate, beatSec, key) {
    const hop = Math.max(512, Math.round(sampleRate * 0.125));
    const frames = [];
    for (let center = 1024; center < samples.length; center += hop) frames.push({ time: center / sampleRate, ...yinFrame(samples, center, sampleRate) });
    const slotSec = beatSec / 2;
    const slots = [];
    const slotCount = Math.ceil(samples.length / sampleRate / slotSec);
    let frameCursor = 0;
    for (let slot = 0; slot < slotCount; slot++) {
      const startSec = slot * slotSec; const endSec = Math.min(samples.length / sampleRate, startSec + slotSec); const center = (startSec + endSec) / 2;
      const windowStart = center - slotSec * 0.66; const windowEnd = center + slotSec * 0.66;
      while (frameCursor < frames.length && frames[frameCursor].time < windowStart) frameCursor++;
      const votes = new Map();
      for (let index = frameCursor; index < frames.length && frames[index].time <= windowEnd; index++) {
        const frame = frames[index];
        if (frame.midi == null) continue;
        const note = Math.round(frame.midi); const value = (votes.get(note) || 0) + (frame.confidence || 0.1) * Math.sqrt(frame.rms || 0.01);
        votes.set(note, value);
      }
      let midi = null;
      if (votes.size) {
        midi = Number([...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
      }
      slots.push({ startSec, endSec, midi });
    }
    const events = [];
    for (let i = 0; i < slots.length;) {
      const first = slots[i]; let end = i + 1;
      while (end < slots.length && slots[end].midi === first.midi) end++;
      const durationSlots = end - i; const durationBeats = durationSlots / 2;
      const bar = Math.floor(first.startSec / (beatSec * 4)) + 1;
      if (first.midi == null) {
        events.push({ type: 'rest', startSec: first.startSec, endSec: slots[end - 1].endSec, durationBeats, bar, symbol: durationBeats >= 4 ? 'whole' : durationBeats >= 2 ? 'half' : durationBeats >= 1 ? 'quarter' : 'eighth' });
      } else {
        const midi = Math.round(first.midi);
        events.push({ type: 'note', midi, name: midiName(midi), jianpu: jianpu(midi, key), staffPosition: staffPosition(midi), accidental: mod(midi, 12) === 1 || mod(midi, 12) === 3 || mod(midi, 12) === 6 || mod(midi, 12) === 8 || mod(midi, 12) === 10 ? NOTE_SHARP[mod(midi, 12)].slice(1) : '', startSec: first.startSec, endSec: slots[end - 1].endSec, durationBeats, bar, symbol: durationBeats >= 4 ? 'whole' : durationBeats >= 2 ? 'half' : durationBeats >= 1 ? 'quarter' : 'eighth' });
      }
      i = end;
    }
    return events;
  }

  function transposeChord(chord, semitones) {
    const match = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(String(chord || '').trim());
    if (!match) return chord;
    const pitch = name => {
      const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
      return map[name];
    };
    const root = pitch(match[1]); const bass = match[3] ? pitch(match[3]) : null;
    if (root == null || (match[3] && bass == null)) return chord;
    return NOTE_NAMES[mod(root + Number(semitones || 0), 12)] + match[2] + (bass == null ? '' : '/' + NOTE_NAMES[mod(bass + Number(semitones || 0), 12)]);
  }

  function transposeAnalysis(analysis, semitones) {
    const shift = clamp(Math.trunc(Number(semitones) || 0), -6, 6);
    const clone = JSON.parse(JSON.stringify(analysis));
    clone.transpose = shift;
    const shiftedRoot = mod(analysis.key.root + shift, 12);
    const relativeRoot = mod(shiftedRoot + (analysis.key.mode === 'major' ? 9 : 3), 12);
    clone.key = {
      ...analysis.key,
      root: shiftedRoot,
      rootName: NOTE_NAMES[shiftedRoot],
      tonic: NOTE_NAMES[shiftedRoot] + (analysis.key.mode === 'minor' ? 'm' : ''),
      name: `${KEY_NAMES[shiftedRoot]} ${analysis.key.mode === 'major' ? 'trưởng' : 'thứ'} (${NOTE_NAMES[shiftedRoot]}${analysis.key.mode === 'minor' ? 'm' : ''})`,
      relative: NOTE_NAMES[relativeRoot],
      relativeName: NOTE_NAMES[relativeRoot] + (analysis.key.mode === 'major' ? 'm' : ''),
    };
    clone.bars = analysis.bars.map(bar => ({ ...bar, chord: transposeChord(bar.chord, shift), notes: (bar.notes || []).map(note => transposeNote(note, shift, clone.key)) }));
    clone.notes = analysis.notes.map(note => transposeNote(note, shift, clone.key));
    clone.capo = suggestCapo(clone.bars);
    return clone;
  }

  function transposeNote(note, shift, key) {
    if (note.type !== 'note') return { ...note };
    const midi = note.midi + shift;
    return { ...note, midi, name: midiName(midi), jianpu: jianpu(midi, key), staffPosition: staffPosition(midi), accidental: [1, 3, 6, 8, 10].includes(mod(midi, 12)) ? '#' : '' };
  }

  function suggestCapo(bars) {
    let best = { capo: 0, score: Infinity, shapes: [] };
    const chords = [...new Set(bars.map(bar => bar.chord).filter(Boolean))];
    for (let capo = 0; capo <= 6; capo++) {
      let score = capo * 0.16; const shapes = [];
      for (const chord of chords) {
        const parsed = parseChord(chord);
        if (!parsed) continue;
        const shapeRoot = mod(parsed.root - capo, 12);
        const shape = OPEN_SHAPES[parsed.quality]?.[shapeRoot];
        if (shape) { score += 0.18; shapes.push({ chord, shape, capo }); }
        else { score += 1; shapes.push({ chord, shape: chord, capo }); }
      }
      if (score < best.score) best = { capo, score, shapes };
    }
    return { fret: best.capo, name: best.capo ? `Kẹp ngăn ${best.capo}` : 'Không cần capo', shapes: best.shapes };
  }

  function parseChord(chord) {
    const match = /^([A-G](?:#|b)?)(.*)$/.exec(chord);
    if (!match) return null;
    const root = notePitch(match[1]);
    const suffix = match[2].split('/')[0];
    const aliases = { '': 'maj', m: 'min', min: 'min', '7': '7', maj7: 'maj7', M7: 'maj7', m7: 'm7', min7: 'm7', sus4: 'sus4', dim: 'dim', '°': 'dim' };
    const quality = aliases[suffix];
    return root == null || !quality ? null : { root, quality };
  }

  function notePitch(name) {
    return ({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 })[name];
  }

  function analyzePcm(samples, sampleRate, opts = {}) {
    if (!samples || typeof samples.length !== 'number' || !samples.length) throw new TypeError('Không có dữ liệu âm thanh để phân tích.');
    if (!(sampleRate > 0)) throw new RangeError('Tần số lấy mẫu không hợp lệ.');
    const tempo = analyzeTempo(samples, sampleRate);
    const chromaSize = 4096; const chromaHop = 2048; const chromaFrames = [];
    const limit = samples.length;
    for (let start = 0; start < limit; start += chromaHop) {
      const spectrum = fftFrame(samples, start, chromaSize, sampleRate);
      const sum = spectrum.chroma.reduce((total, value) => total + value, 0) || 1;
      const bassSum = spectrum.bass.reduce((total, value) => total + value, 0) || 1;
      chromaFrames.push({
        time: (start + chromaSize / 2) / sampleRate,
        values: Array.from(spectrum.chroma, value => value / sum),
        bass: Array.from(spectrum.bass, value => value / bassSum),
      });
    }
    const overall = new Float64Array(12);
    for (const frame of chromaFrames) for (let i = 0; i < 12; i++) overall[i] += frame.values[i];
    const key = identifyKey(overall);
    const duration = samples.length / sampleRate;
    const barSec = tempo.beatSec * 4;
    const barCount = Math.max(1, Math.ceil(duration / barSec));
    const barChromas = [];
    for (let index = 0; index < barCount; index++) {
      const startSec = index * barSec; const endSec = Math.min(duration, startSec + barSec); const chroma = new Float64Array(12);
      const selected = chromaFrames.filter(frame => frame.time >= startSec && frame.time < endSec);
      for (const frame of selected) for (let pc = 0; pc < 12; pc++) chroma[pc] += frame.values[pc] * 0.05 + frame.bass[pc] * 3;
      if (!selected.length && chromaFrames.length) for (let pc = 0; pc < 12; pc++) chroma[pc] = overall[pc];
      barChromas.push(chroma);
    }
    const chosen = chooseChordSequence(barChromas, key);
    const bars = chosen.map((item, index) => ({ bar: index + 1, startSec: index * barSec, endSec: Math.min(duration, (index + 1) * barSec), chord: item.chord, notes: [], score: item.score }));
    const notes = detectMelody(samples, sampleRate, tempo.beatSec, key);
    for (const note of notes) {
      const bar = bars[Math.min(bars.length - 1, Math.max(0, note.bar - 1))];
      if (bar) bar.notes.push(note);
    }
    const analysis = { sampleRate, duration, bpm: tempo.bpm, beatSec: 60 / tempo.bpm, barSec: 60 / tempo.bpm * 4, meter: '4/4', tempoConfidence: tempo.confidence, key, bars, notes, transpose: 0 };
    analysis.capo = suggestCapo(bars);
    return opts.transpose ? transposeAnalysis(analysis, opts.transpose) : analysis;
  }

  const GUITAR_SHAPES = {
    C: ['x', 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], D: ['x', 'x', 0, 2, 3, 2], A: ['x', 0, 2, 2, 2, 0], E: [0, 2, 2, 1, 0, 0], F: [1, 3, 3, 2, 1, 1], Am: ['x', 0, 2, 2, 1, 0], Dm: ['x', 'x', 0, 2, 3, 1], Em: [0, 2, 2, 0, 0, 0], Bm: ['x', 2, 4, 4, 3, 2], 'C7': ['x', 3, 2, 3, 1, 0], 'G7': [3, 2, 0, 0, 0, 1], 'A7': ['x', 0, 2, 0, 2, 0], 'D7': ['x', 'x', 0, 2, 1, 2], 'E7': [0, 2, 0, 1, 0, 0], 'Fmaj7': ['x', 'x', 3, 2, 1, 0], 'Cmaj7': ['x', 3, 2, 0, 0, 0], 'Am7': ['x', 0, 2, 0, 1, 0], 'Dm7': ['x', 'x', 0, 2, 1, 1], 'Em7': [0, 2, 0, 0, 0, 0], 'Dsus4': ['x', 'x', 0, 2, 3, 3], 'Gsus4': [3, 0, 0, 0, 1, 3], B7: ['x', 2, 1, 2, 0, 2], Bdim: ['x', 2, 3, 4, 3, 'x'],
  };

  function chordShape(chord) {
    if (GUITAR_SHAPES[chord]) return GUITAR_SHAPES[chord];
    const parsed = parseChord(chord);
    if (!parsed) return ['x', 'x', 'x', 'x', 'x', 'x'];
    const suffix = QUALITY_BY_ID[parsed.quality].suffix;
    const shapeName = NOTE_SHARP[parsed.root] + suffix;
    if (GUITAR_SHAPES[shapeName]) return GUITAR_SHAPES[shapeName];
    const tones = new Set(QUALITY_BY_ID[parsed.quality].intervals.map(interval => mod(parsed.root + interval, 12)));
    const tuning = [40, 45, 50, 55, 59, 64];
    const options = tuning.map(open => ['x', ...Array.from({ length: 13 }, (_, fret) => fret).filter(fret => tones.has(mod(open + fret, 12)))]);
    let best = null; let bestScore = Infinity; const shape = [];
    function visit(string, fretted, heard, sounding) {
      if (string === tuning.length) {
        if (sounding < 4) return;
        const missing = [...tones].filter(tone => !heard.has(tone)).length;
        const minimum = fretted.length ? Math.min(...fretted) : 0;
        const maximum = fretted.length ? Math.max(...fretted) : 0;
        if (fretted.length && maximum - minimum > 4) return;
        const bassIndex = shape.findIndex(fret => fret !== 'x');
        const bassPc = bassIndex < 0 ? -1 : mod(tuning[bassIndex] + Number(shape[bassIndex]), 12);
        const score = missing * 5 + (6 - sounding) * 0.25 + (maximum - minimum) * 0.35 + maximum * 0.045 + (bassPc === parsed.root ? 0 : 0.4);
        if (score < bestScore) { bestScore = score; best = shape.slice(); }
        return;
      }
      for (const fret of options[string]) {
        const nextFretted = typeof fret === 'number' && fret > 0 ? [...fretted, fret] : fretted;
        if (nextFretted.length > 1 && Math.max(...nextFretted) - Math.min(...nextFretted) > 4) continue;
        const nextHeard = new Set(heard);
        if (fret !== 'x') nextHeard.add(mod(tuning[string] + Number(fret), 12));
        shape.push(fret);
        visit(string + 1, nextFretted, nextHeard, sounding + (fret === 'x' ? 0 : 1));
        shape.pop();
      }
    }
    visit(0, [], new Set(), 0);
    return best || ['x', 'x', 'x', 'x', 'x', 'x'];
  }

  function drawChordDiagram(chord, x, y, width = 78) {
    const shape = chordShape(chord); const playedFrets = shape.filter(fret => typeof fret === 'number' && fret > 0);
    const baseFret = playedFrets.length ? Math.max(1, Math.min(...playedFrets)) : 1;
    const left = x + 10; const top = y + 24; const gridW = 54; const gridH = 42;
    let svg = `<g class="chord-diagram"><text x="${x + width / 2}" y="${y + 11}" text-anchor="middle" class="diagram-label">${escapeXml(chord)}</text>`;
    if (baseFret > 1) svg += `<text x="${x + 2}" y="${top + 20}" class="diagram-open">${baseFret}fr</text>`;
    for (let string = 0; string < 6; string++) svg += `<line x1="${left + string * (gridW / 5)}" y1="${top}" x2="${left + string * (gridW / 5)}" y2="${top + gridH}" class="diagram-string"/>`;
    for (let fret = 0; fret <= 4; fret++) svg += `<line x1="${left}" y1="${top + fret * (gridH / 4)}" x2="${left + gridW}" y2="${top + fret * (gridH / 4)}" class="diagram-fret"/>`;
    shape.forEach((fret, string) => {
      const cx = left + string * (gridW / 5);
      if (fret === 'x' || fret === 0) svg += `<text x="${cx}" y="${top - 5}" text-anchor="middle" class="diagram-open">${fret === 'x' ? '×' : '○'}</text>`;
      else svg += `<circle cx="${cx}" cy="${top + (Number(fret) - baseFret + 0.5) * (gridH / 4)}" r="3.1" class="diagram-dot"/>`;
    });
    return svg + '</g>';
  }

  function renderStaffSystem(analysis, bars, top, rowHeight) {
    const left = 70; const right = 752; const width = right - left; const barWidth = width / 4; const baseY = top + rowHeight - 38;
    let svg = `<g class="staff-system"><text x="30" y="${baseY - 25}" class="clef">𝄞</text>`;
    for (let line = 0; line < 5; line++) svg += `<line x1="${left}" y1="${baseY - line * 10}" x2="${right}" y2="${baseY - line * 10}" class="staff-line"/>`;
    for (let i = 0; i <= 4; i++) svg += `<line x1="${left + i * barWidth}" y1="${baseY - 42}" x2="${left + i * barWidth}" y2="${baseY + 2}" class="bar-line"/>`;
    for (let index = 0; index < 4; index++) {
      const bar = bars[index]; if (!bar) continue;
      const x = left + index * barWidth;
      svg += `<text x="${x + 5}" y="${top + 15}" class="bar-number">${bar.bar}</text><text x="${x + barWidth / 2}" y="${top + 17}" text-anchor="middle" class="chord-label">${escapeXml(bar.chord)}</text>`;
      for (const note of bar.notes || []) {
        const beatOffset = clamp((note.startSec - bar.startSec) / (analysis.beatSec || 0.5), 0, 4);
        const nx = x + 13 + beatOffset / 4 * (barWidth - 26);
        if (note.type === 'rest') {
          const glyph = note.symbol === 'whole' ? '𝄻' : note.symbol === 'half' ? '𝄼' : note.symbol === 'quarter' ? '𝄽' : '𝄾';
          svg += `<text x="${nx}" y="${baseY - 13}" class="rest-mark">${glyph}</text>`;
          continue;
        }
        const step = note.staffPosition - staffPosition(64); const ny = baseY - step * 5;
        for (let ledger = 1; ny < baseY - 42 - ledger * 10; ledger++) svg += `<line x1="${nx - 9}" y1="${baseY - 42 - ledger * 10}" x2="${nx + 9}" y2="${baseY - 42 - ledger * 10}" class="ledger-line"/>`;
        for (let ledger = 1; ny > baseY + ledger * 10; ledger++) svg += `<line x1="${nx - 9}" y1="${baseY + ledger * 10}" x2="${nx + 9}" y2="${baseY + ledger * 10}" class="ledger-line"/>`;
        if (note.accidental) svg += `<text x="${nx - 12}" y="${ny + 4}" class="accidental">${note.accidental === 'b' ? '♭' : '♯'}</text>`;
        const open = note.symbol === 'half' || note.symbol === 'whole';
        svg += `<ellipse cx="${nx}" cy="${ny}" rx="6.2" ry="4.3" transform="rotate(-18 ${nx} ${ny})" class="note-head${open ? ' note-open' : ''}"/>`;
        if (note.symbol !== 'whole') {
          const stemX = nx + 5; const stemEnd = ny - 34;
          svg += `<line x1="${stemX}" y1="${ny}" x2="${stemX}" y2="${stemEnd}" class="note-stem"/>`;
          if (note.symbol === 'eighth') svg += `<path d="M ${stemX} ${stemEnd} q 14 8 7 19" class="note-flag"/>`;
        }
        svg += `<text x="${nx}" y="${baseY + 22}" text-anchor="middle" class="jianpu-note">${escapeXml(note.jianpu || '')}</text>`;
      }
    }
    return svg + '</g>';
  }

  function renderSheetSvgPages(analysis, meta = {}) {
    const title = escapeXml(meta.title || meta.name || 'Bản nhạc mới');
    const author = escapeXml(meta.author || meta.artist || '');
    const bars = Array.isArray(analysis.bars) && analysis.bars.length ? analysis.bars : [{ bar: 1, startSec: 0, endSec: 0, chord: '—', notes: [] }];
    const pageCount = Math.ceil(bars.length / 24);
    const uniqueChords = [...new Set(bars.map(bar => bar.chord).filter(Boolean))].slice(0, 8);
    return Array.from({ length: pageCount }, (_, pageIndex) => {
      const firstPage = pageIndex === 0; const pageBars = bars.slice(pageIndex * 24, (pageIndex + 1) * 24); const top = firstPage ? 292 : 90; const rowHeight = firstPage ? 124 : 154;
      let body = '';
      const rowCount = Math.ceil(pageBars.length / 4);
      for (let row = 0; row < rowCount; row++) body += renderStaffSystem(analysis, pageBars.slice(row * 4, row * 4 + 4), top + row * rowHeight, rowHeight);
      let heading = `<text x="46" y="52" class="song-title">${title}</text>`;
      if (author) heading += `<text x="48" y="82" class="author">${author}</text>`;
      heading += `<text x="48" y="120" class="meta">Giọng: ${escapeXml(analysis.key?.name || 'Chưa xác định')}</text><text x="300" y="120" class="meta">♩ = ${escapeXml(analysis.bpm || '—')} BPM</text><text x="518" y="120" class="meta">Nhịp ${escapeXml(analysis.meter || '4/4')}</text><text x="48" y="151" class="meta">${escapeXml(analysis.capo?.name || 'Không cần capo')}</text>`;
      if (firstPage && uniqueChords.length) {
        heading += '<text x="48" y="184" class="diagram-heading">Sơ đồ thế bấm Guitar</text>';
        uniqueChords.forEach((chord, index) => { heading += drawChordDiagram(chord, 44 + index * 84, 194, 78); });
      }
      const footer = `<text x="397" y="1090" text-anchor="middle" class="footer">Duy TTD Studio · Ký âm &amp; Hợp âm tự động trên trình duyệt · Trang ${pageIndex + 1}/${pageCount}</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123" role="img" aria-label="Bản nhạc ${title}"><rect width="794" height="1123" fill="#fff"/><style>
        text{font-family:Arial,"Segoe UI",sans-serif;fill:#171717}.song-title{font-size:27px;font-weight:700}.author{font-size:13px;fill:#555}.meta{font-size:14px}.diagram-heading{font-size:13px;font-weight:700}.diagram-label{font-size:11px;font-weight:700}.diagram-string,.diagram-fret{stroke:#555;stroke-width:.8}.diagram-fret:first-of-type{stroke:#222;stroke-width:1.5}.diagram-open{font-size:9px;fill:#333}.diagram-dot{fill:#171717}.staff-line{stroke:#555;stroke-width:.8}.bar-line{stroke:#333;stroke-width:.9}.clef{font-family:"Noto Music","Segoe UI Symbol",serif;font-size:36px}.bar-number{font-size:10px;fill:#555}.chord-label{font-size:15px;font-weight:700}.ledger-line{stroke:#555;stroke-width:.8}.note-head{fill:#161616;stroke:#161616;stroke-width:1}.note-open{fill:#fff;stroke-width:1.5}.note-stem{stroke:#161616;stroke-width:1.3}.note-flag{fill:none;stroke:#161616;stroke-width:1.5}.accidental,.rest-mark{font-size:15px}.jianpu-note{font-size:11px;fill:#222}.footer{font-size:10px;fill:#555}
      </style>${heading}${body}${footer}</svg>`;
    });
  }

  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('Trang JPEG phải là Uint8Array, Buffer hoặc ArrayBuffer.');
  }

  function jpegDimensions(bytes) {
    const data = bytesOf(bytes);
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new TypeError('Dữ liệu không phải JPEG hợp lệ.');
    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset] !== 0xff) { offset++; continue; }
      let marker = data[offset + 1]; offset += 2;
      while (marker === 0xff) marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = (data[offset] << 8) | data[offset + 1];
      if (length < 2 || offset + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (data[offset + 3] << 8) | data[offset + 4], width: (data[offset + 5] << 8) | data[offset + 6] };
      }
      offset += length;
    }
    throw new TypeError('Không tìm thấy kích thước ảnh trong JPEG.');
  }

  function ascii(value) { return new TextEncoder().encode(value); }

  function buildPdfFromJpegPages(jpegPages) {
    if (!Array.isArray(jpegPages) || !jpegPages.length) throw new TypeError('Cần ít nhất một trang JPEG để tạo PDF.');
    const pages = jpegPages.map(page => {
      const bytes = bytesOf(page && page.bytes !== undefined ? page.bytes : page);
      const size = page && page.width > 0 && page.height > 0 ? { width: page.width, height: page.height } : jpegDimensions(bytes);
      return { bytes, width: Math.trunc(size.width), height: Math.trunc(size.height) };
    });
    const objects = [];
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
    objects[2] = ascii(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
    pages.forEach((page, index) => {
      const pageId = 3 + index * 3; const contentId = pageId + 1; const imageId = pageId + 2;
      objects[pageId] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      const content = ascii('q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n');
      objects[contentId] = concatBytes([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('endstream')]);
      objects[imageId] = concatBytes([ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`), page.bytes, ascii('\nendstream')]);
    });
    const chunks = [ascii('%PDF-1.4\n%âãÏÓ\n')]; const offsets = [0]; let position = chunks[0].length;
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = position;
      const chunk = concatBytes([ascii(`${id} 0 obj\n`), objects[id], ascii('\nendobj\n')]);
      chunks.push(chunk); position += chunk.length;
    }
    const xrefOffset = position;
    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(ascii(xref));
    return concatBytes(chunks);
  }

  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(length); let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function svgToJpeg(svg, width = 1588, height = 2246) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d', { alpha: false }); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
          canvas.toBlob(result => {
            URL.revokeObjectURL(url);
            if (!result) { reject(new Error('Trình duyệt không tạo được ảnh PDF.')); return; }
            result.arrayBuffer().then(buffer => resolve({ bytes: new Uint8Array(buffer), width, height }), reject);
          }, 'image/jpeg', 0.96);
        } catch (error) { URL.revokeObjectURL(url); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không thể dựng trang SVG để in PDF.')); };
      image.src = url;
    });
  }

  async function exportAnalysisToPdfBlob(analysis, meta = {}) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('Xuất PDF cần trình duyệt có Canvas.');
    const pages = renderSheetSvgPages(analysis, meta); const jpegPages = [];
    for (const page of pages) jpegPages.push(await svgToJpeg(page));
    return new Blob([buildPdfFromJpegPages(jpegPages)], { type: 'application/pdf' });
  }

  function resampleMono(audioBuffer) {
    const sourceRate = audioBuffer.sampleRate; const outputLength = Math.ceil(audioBuffer.length * SAMPLE_RATE / sourceRate);
    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
    const mono = new Float32Array(outputLength);
    for (let out = 0; out < outputLength; out++) {
      const position = out * sourceRate / SAMPLE_RATE; const left = Math.floor(position); const fraction = position - left; let value = 0;
      for (const channel of channels) {
        const a = channel[Math.min(left, channel.length - 1)] || 0; const b = channel[Math.min(left + 1, channel.length - 1)] || a;
        value += a + (b - a) * fraction;
      }
      mono[out] = value / channels.length;
    }
    return mono;
  }

  function safeFilename(value) {
    const cleaned = String(value || 'ban-nhac').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return cleaned || 'ban-nhac';
  }

  function chordSummary(analysis) {
    const chordLine = analysis.bars.map(bar => `${bar.bar}. ${bar.chord}`).join(' | ');
    const melodyLine = analysis.notes.filter(note => note.type === 'note').map(note => note.jianpu).join(' ');
    return `Giọng: ${analysis.key.name}\nTempo: ${analysis.bpm} BPM · Nhịp ${analysis.meter}\nCapo: ${analysis.capo.name}\nHợp âm: ${chordLine}\nCảm âm: ${melodyLine}`;
  }

  function mount(panel) {
    if (!panel || panel.dataset.kyAmMounted === 'true') return false;
    const root = panel.querySelector('.mini-transcribe');
    if (!root) return false;
    panel.dataset.kyAmMounted = 'true';
    const byId = id => panel.querySelector('#' + id);
    const fileInput = byId('mini-score-file'); const titleInput = byId('mini-score-title-input'); const authorInput = byId('mini-score-author');
    const transposeInput = byId('mini-score-transpose'); const transposeValue = byId('mini-score-transpose-value');
    const analyzeButton = byId('mini-score-analyze'); const status = byId('mini-score-status'); const results = byId('mini-score-results');
    const preview = byId('mini-score-preview'); const pdfButton = byId('mini-score-pdf'); const printButton = byId('mini-score-print'); const copyButton = byId('mini-score-copy');
    let selectedFile = null; let originalAnalysis = null; let currentAnalysis = null;
    const say = message => { status.textContent = message; };
    const meta = () => ({ title: titleInput.value.trim() || selectedFile?.name.replace(/\.[^.]+$/, '') || 'Bản nhạc mới', author: authorInput.value.trim() });
    const setFile = file => {
      if (!file) return;
      const extension = file.name.split('.').pop().toLowerCase();
      if (!['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(extension)) { say('Định dạng chưa hỗ trợ. Chọn MP3, WAV, M4A, OGG hoặc FLAC.'); return; }
      if (file.size > 80 * 1000 * 1000) { say('File vượt giới hạn 80 MB.'); return; }
      selectedFile = file; fileInput.files && (fileInput.value = '');
      titleInput.value = titleInput.value.trim() || file.name.replace(/\.[^.]+$/, '');
      say(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MiB · chỉ xử lý trên thiết bị này.`);
    };
    fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
    root.addEventListener('dragover', event => { event.preventDefault(); root.classList.add('is-dragging'); });
    root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) root.classList.remove('is-dragging'); });
    root.addEventListener('drop', event => { event.preventDefault(); root.classList.remove('is-dragging'); setFile(event.dataTransfer?.files?.[0]); });
    analyzeButton.addEventListener('click', async () => {
      if (!selectedFile) { say('Chọn hoặc kéo thả một file nhạc trước.'); return; }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) { say('Trình duyệt này chưa hỗ trợ Web Audio API.'); return; }
      analyzeButton.disabled = true; results.hidden = true; say('Đang giải mã file cục bộ bằng Web Audio…');
      let context;
      try {
        const bytes = await selectedFile.arrayBuffer();
        context = new AudioContextClass();
        const decoded = await context.decodeAudioData(bytes.slice(0));
        const mono = resampleMono(decoded);
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        say('Đang phân tích nhịp, giọng, hợp âm và giai điệu…');
        originalAnalysis = analyzePcm(mono, SAMPLE_RATE);
        currentAnalysis = transposeAnalysis(originalAnalysis, Number(transposeInput.value));
        showAnalysis();
        say(`Hoàn tất · ${Math.floor(originalAnalysis.duration / 60)}:${String(Math.floor(originalAnalysis.duration % 60)).padStart(2, '0')} · dữ liệu chưa rời khỏi trình duyệt.`);
      } catch (error) { say(error?.message || 'Không giải mã được file âm thanh trong trình duyệt này.'); }
      finally { if (context && context.state !== 'closed') await context.close().catch(() => {}); analyzeButton.disabled = false; }
    });
    function showAnalysis() {
      const stats = byId('mini-score-stats'); stats.textContent = `${currentAnalysis.key.name} · ${currentAnalysis.bpm} BPM · ${currentAnalysis.capo.name}`;
      const chords = byId('mini-score-chords'); chords.replaceChildren();
      currentAnalysis.bars.forEach(bar => {
        const item = document.createElement('span'); item.className = 'score-chord'; item.textContent = `${bar.bar} · ${bar.chord}`; chords.append(item);
      });
      const diagramMarkup = [...new Set(currentAnalysis.bars.map(bar => bar.chord))].slice(0, 8).map((chord, index) => drawChordDiagram(chord, index * 84, 0, 78)).join('');
      byId('mini-score-diagrams').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 690 76" role="img" aria-label="Sơ đồ thế bấm Guitar">${diagramMarkup}</svg>`;
      preview.replaceChildren();
      for (const page of renderSheetSvgPages(currentAnalysis, meta())) {
        const wrapper = document.createElement('div'); wrapper.className = 'score-page'; wrapper.innerHTML = page; preview.append(wrapper);
      }
      results.hidden = false;
    }
    transposeInput.addEventListener('input', () => {
      const value = Number(transposeInput.value); transposeValue.textContent = `${value > 0 ? '+' : ''}${value} bán cung`;
      if (originalAnalysis) { currentAnalysis = transposeAnalysis(originalAnalysis, value); showAnalysis(); }
    });
    titleInput.addEventListener('input', () => { if (currentAnalysis) showAnalysis(); });
    authorInput.addEventListener('input', () => { if (currentAnalysis) showAnalysis(); });
    pdfButton.addEventListener('click', async () => {
      if (!currentAnalysis) return;
      pdfButton.disabled = true; say('Đang dựng PDF A4 nét cao…');
      try {
        const blob = await exportAnalysisToPdfBlob(currentAnalysis, meta()); const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = safeFilename(meta().title) + '-hop-am-ky-am.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        say('Đã tạo và tải PDF A4.');
      } catch (error) { say(error?.message || 'Không tạo được PDF.'); }
      finally { pdfButton.disabled = false; }
    });
    printButton.addEventListener('click', () => {
      if (!currentAnalysis) return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) { say('Trình duyệt đã chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.'); return; }
      const pages = renderSheetSvgPages(currentAnalysis, meta()).join('<div class="page-break"></div>');
      printWindow.document.open(); printWindow.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeXml(meta().title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff}.page-break{page-break-after:always;break-after:page}svg{display:block;width:210mm;height:297mm}@media screen{body{background:#ddd}.page-break{height:12px}}</style></head><body>${pages}<script>window.addEventListener('load',()=>window.print())<\/script></body></html>`);
      printWindow.document.close();
    });
    copyButton.addEventListener('click', async () => {
      if (!currentAnalysis) return;
      try {
        await navigator.clipboard.writeText(chordSummary(currentAnalysis)); say('Đã copy vòng hợp âm và cảm âm số.');
      } catch {
        const textarea = document.createElement('textarea'); textarea.value = chordSummary(currentAnalysis); document.body.append(textarea); textarea.select();
        const copied = document.execCommand('copy'); textarea.remove(); say(copied ? 'Đã copy vòng hợp âm và cảm âm số.' : 'Không thể truy cập clipboard trong trình duyệt này.');
      }
    });
    return true;
  }

  return { analyzePcm, transposeChord, transposeAnalysis, renderSheetSvgPages, buildPdfFromJpegPages, exportAnalysisToPdfBlob, mount, fft, jpegDimensions };
});
