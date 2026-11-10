const { describe, expect, it } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BITS_PER_SAMPLE,
  OUTPUT_DIR,
  PEAK_AMPLITUDE,
  RNF01_BAND,
  SAMPLE_RATE,
  TONES,
  analyzeSamples,
  encodeWav,
  generateTones,
  readWav,
  synthesizeTone,
} = require('./generate-tones');

const [checkTone, alertTone] = TONES;

function writtenTone(tone) {
  return readWav(encodeWav(synthesizeTone(tone)));
}

function hardGatedTone(tone) {
  const pulseLength = Math.round(tone.pulseSeconds * SAMPLE_RATE);
  const gapLength = Math.round(tone.gapSeconds * SAMPLE_RATE);
  const samples = new Float64Array(tone.pulses * (pulseLength + gapLength));
  for (let pulse = 0; pulse < tone.pulses; pulse += 1) {
    for (let index = 0; index < pulseLength; index += 1) {
      samples[pulse * (pulseLength + gapLength) + index] =
        PEAK_AMPLITUDE * Math.sin((2 * Math.PI * tone.frequency * index) / SAMPLE_RATE);
    }
  }
  return samples;
}

describe('RNF01 - frequências dos tons de alerta', () => {
  it('usa 1.000 Hz na verificação e 2.500 Hz nas etapas do escalonamento', () => {
    expect(TONES.map((tone) => [tone.fileName, tone.frequency])).toEqual([
      ['check-tone-1000hz.wav', 1000],
      ['alert-tone-2500hz.wav', 2500],
    ]);
  });

  it('as frequências nominais ficam entre 400 e 4.000 Hz', () => {
    expect(RNF01_BAND).toEqual({ low: 400, high: 4000 });
    TONES.forEach((tone) => {
      expect(tone.frequency).toBeGreaterThanOrEqual(RNF01_BAND.low);
      expect(tone.frequency).toBeLessThanOrEqual(RNF01_BAND.high);
    });
  });

  it('o pico do espectro de cada arquivo fica na frequência nominal', () => {
    TONES.forEach((tone) => {
      const { samples, sampleRate } = writtenTone(tone);
      const analysis = analyzeSamples(samples, sampleRate);
      expect(Math.abs(analysis.peakFrequency - tone.frequency)).toBeLessThanOrEqual(analysis.resolutionHz);
    });
  });

  it('a energia fora de 400 a 4.000 Hz fica pelo menos 80 dB abaixo do total', () => {
    TONES.forEach((tone) => {
      const { samples, sampleRate } = writtenTone(tone);
      expect(analyzeSamples(samples, sampleRate).outOfBandDecibels).toBeLessThan(-80);
    });
  });

  it('as rampas de 10 ms reduzem a energia fora da faixa em relação a um tom cortado seco', () => {
    TONES.forEach((tone) => {
      const smooth = analyzeSamples(synthesizeTone(tone), SAMPLE_RATE).outOfBandDecibels;
      const abrupt = analyzeSamples(hardGatedTone(tone), SAMPLE_RATE).outOfBandDecibels;
      expect(abrupt - smooth).toBeGreaterThan(20);
    });
  });

  it('a conferência do espectro reprova um tom fora da faixa', () => {
    const lowTone = synthesizeTone({ ...checkTone, frequency: 100 });
    const analysis = analyzeSamples(lowTone, SAMPLE_RATE);
    expect(analysis.peakFrequency).toBeCloseTo(100, -1);
    expect(analysis.bandEnergyFraction).toBeLessThan(0.01);
  });
});

describe('RNF01 - arquivos WAV dos tons', () => {
  it('grava PCM mono de 16 bits a 44,1 kHz com cabeçalho WAV válido', () => {
    const bytes = encodeWav(synthesizeTone(checkTone));
    const view = new DataView(bytes.buffer);
    const text = (offset) => String.fromCharCode(...bytes.slice(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(BITS_PER_SAMPLE);
    expect(view.getUint32(40, true)).toBe(bytes.length - 44);
  });

  it('o tom da verificação é curto e o das etapas tem quatro pulsos em 1 s', () => {
    expect(writtenTone(checkTone).samples.length / SAMPLE_RATE).toBeCloseTo(0.3, 5);
    expect(writtenTone(alertTone).samples.length / SAMPLE_RATE).toBeCloseTo(1, 5);
    expect(alertTone.pulses).toBe(4);
  });

  it('começa e termina em silêncio, sem estalo, e não passa do volume de pico', () => {
    TONES.forEach((tone) => {
      const { samples } = writtenTone(tone);
      expect(samples[0]).toBe(0);
      expect(samples[samples.length - 1]).toBe(0);
      expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(PEAK_AMPLITUDE);
    });
  });

  it('os arquivos em assets/sounds são exatamente os gerados pelo script', () => {
    TONES.forEach((tone) => {
      const committed = new Uint8Array(fs.readFileSync(path.join(OUTPUT_DIR, tone.fileName)));
      expect(Buffer.compare(committed, encodeWav(synthesizeTone(tone)))).toBe(0);
    });
  });

  it('o script grava os arquivos e descreve a conferência de cada um', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-drive-tones-'));
    const lines = generateTones(outputDir);
    expect(fs.readdirSync(outputDir).sort()).toEqual(TONES.map((tone) => tone.fileName).sort());
    expect(lines[0]).toMatch(/^check-tone-1000hz\.wav \| .* \| frequência nominal 1000 Hz \| pico medido 100\d,\d Hz/);
    expect(lines[1]).toMatch(/energia fora de 400–4000 Hz: -\d+,\d dB em relação ao total \| duração 1,00 s$/);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
