const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const WAV_HEADER_SIZE = 44;
const PEAK_AMPLITUDE = 0.8;
const FADE_SECONDS = 0.01;
const RNF01_BAND = { low: 400, high: 4000 };
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

const TONES = [
  {
    fileName: 'check-tone-1000hz.wav',
    purpose: 'Verificação periódica: tom curto',
    frequency: 1000,
    pulses: 1,
    pulseSeconds: 0.3,
    gapSeconds: 0,
  },
  {
    fileName: 'alert-tone-2500hz.wav',
    purpose: 'Etapas 1 a 3 do escalonamento: pulsos repetidos em laço',
    frequency: 2500,
    pulses: 4,
    pulseSeconds: 0.15,
    gapSeconds: 0.1,
  },
];

function fadeGain(index, pulseLength, fadeLength) {
  const distanceToEdge = Math.min(index, pulseLength - 1 - index);
  if (distanceToEdge >= fadeLength) {
    return 1;
  }
  return 0.5 - 0.5 * Math.cos((Math.PI * distanceToEdge) / fadeLength);
}

function synthesizeTone(tone, sampleRate = SAMPLE_RATE) {
  const pulseLength = Math.round(tone.pulseSeconds * sampleRate);
  const gapLength = Math.round(tone.gapSeconds * sampleRate);
  const fadeLength = Math.round(FADE_SECONDS * sampleRate);
  const samples = new Float64Array(tone.pulses * (pulseLength + gapLength));
  for (let pulse = 0; pulse < tone.pulses; pulse += 1) {
    const start = pulse * (pulseLength + gapLength);
    for (let index = 0; index < pulseLength; index += 1) {
      const wave = Math.sin((2 * Math.PI * tone.frequency * index) / sampleRate);
      samples[start + index] = PEAK_AMPLITUDE * fadeGain(index, pulseLength, fadeLength) * wave;
    }
  }
  return samples;
}

function writeText(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = samples.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_SIZE + dataSize));
  writeText(view, 0, 'RIFF');
  view.setUint32(4, WAV_HEADER_SIZE - 8 + dataSize, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeText(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(WAV_HEADER_SIZE + index * bytesPerSample, Math.round(clamped * 32767), true);
  });
  return new Uint8Array(view.buffer);
}

function readWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const samples = new Float64Array(dataSize / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(WAV_HEADER_SIZE + index * 2, true) / 32767;
  }
  return { sampleRate, samples };
}

function powerSpectrum(samples, sampleRate) {
  let size = 1;
  while (size < samples.length) {
    size *= 2;
  }
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  real.set(samples);
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) {
      reversed ^= bit;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < half; offset += 1) {
        const angle = (-2 * Math.PI * offset) / length;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] * cosine - imaginary[oddIndex] * sine;
        const oddImaginary = real[oddIndex] * sine + imaginary[oddIndex] * cosine;
        real[oddIndex] = real[evenIndex] - oddReal;
        imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] += oddImaginary;
      }
    }
  }
  const power = new Float64Array(size / 2 + 1);
  for (let bin = 0; bin < power.length; bin += 1) {
    power[bin] = real[bin] ** 2 + imaginary[bin] ** 2;
  }
  return { power, binHz: sampleRate / size };
}

function analyzeSamples(samples, sampleRate, band = RNF01_BAND) {
  const { power, binHz } = powerSpectrum(samples, sampleRate);
  let peakBin = 0;
  let total = 0;
  let inBand = 0;
  power.forEach((value, bin) => {
    const frequency = bin * binHz;
    total += value;
    if (frequency >= band.low && frequency <= band.high) {
      inBand += value;
    }
    if (value > power[peakBin]) {
      peakBin = bin;
    }
  });
  const bandEnergyFraction = total === 0 ? 0 : inBand / total;
  return {
    peakFrequency: peakBin * binHz,
    resolutionHz: binHz,
    bandEnergyFraction,
    outOfBandDecibels: 10 * Math.log10(Math.max(1 - bandEnergyFraction, Number.MIN_VALUE)),
    durationSeconds: samples.length / sampleRate,
  };
}

function formatNumber(value, decimals) {
  return value.toFixed(decimals).replace('.', ',');
}

function describeAnalysis(tone, analysis) {
  return [
    tone.fileName,
    tone.purpose,
    `frequência nominal ${tone.frequency} Hz`,
    `pico medido ${formatNumber(analysis.peakFrequency, 1)} Hz (resolução ${formatNumber(analysis.resolutionHz, 2)} Hz)`,
    `energia fora de ${RNF01_BAND.low}–${RNF01_BAND.high} Hz: ${formatNumber(analysis.outOfBandDecibels, 1)} dB em relação ao total`,
    `duração ${formatNumber(analysis.durationSeconds, 2)} s`,
  ].join(' | ');
}

function generateTones(outputDir = OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  return TONES.map((tone) => {
    const bytes = encodeWav(synthesizeTone(tone));
    fs.writeFileSync(path.join(outputDir, tone.fileName), bytes);
    const written = readWav(new Uint8Array(fs.readFileSync(path.join(outputDir, tone.fileName))));
    return describeAnalysis(tone, analyzeSamples(written.samples, written.sampleRate));
  });
}

if (require.main === module) {
  console.log(`Tons gerados em ${OUTPUT_DIR} (PCM ${BITS_PER_SAMPLE} bits, mono, ${SAMPLE_RATE} Hz):`);
  generateTones().forEach((line) => console.log(line));
}

module.exports = {
  SAMPLE_RATE,
  BITS_PER_SAMPLE,
  PEAK_AMPLITUDE,
  FADE_SECONDS,
  RNF01_BAND,
  OUTPUT_DIR,
  TONES,
  synthesizeTone,
  encodeWav,
  readWav,
  analyzeSamples,
  describeAnalysis,
  generateTones,
};
