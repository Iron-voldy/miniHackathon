import crypto from "node:crypto";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { env } from "../lib/env";
import { withTimeout } from "../lib/withTimeout";
import { TtsCache } from "../models/TtsCache";

export type Language = "en" | "si" | "ta";

export interface TtsResult {
  audioBase64?: string;
  text: string;
  fallback: boolean;
}

// Sinhala (si-LK) and Tamil (ta-LK) neural voices are proven working on Azure;
// English falls back to a standard en-US voice. See guide §3.2.
const VOICE_BY_LANGUAGE: Record<Language, string> = {
  si: "si-LK-ThiliniNeural",
  ta: "ta-LK-SaranyaNeural",
  en: "en-US-JennyNeural",
};

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  si: "si-LK",
  ta: "ta-LK",
  en: "en-US",
};

function hashText(text: string, language: Language): string {
  return crypto.createHash("sha256").update(`${language}:${text}`).digest("hex");
}

/**
 * Synthesizes speech for custom-phrase text (board phrases ship pre-baked with the
 * frontend). Checks a cache first; on a cache miss, calls Azure Speech with a 2s
 * timeout; on any failure returns { fallback: true } so the caller can just display
 * text (invariant #9 — TTS must degrade, never hard-fail).
 */
export async function synthesizeSpeech(text: string, language: Language): Promise<TtsResult> {
  const textHash = hashText(text, language);
  const cacheId = `${textHash}:${language}`;

  const cached = await TtsCache.findById(cacheId).lean();
  if (cached) {
    return { audioBase64: cached.audioBase64, text, fallback: false };
  }

  if (!env.AZURE_SPEECH_KEY) {
    return { text, fallback: true };
  }

  return withTimeout<TtsResult>(
    async () => {
      const audioBase64 = await synthesizeWithAzure(text, language);
      const voice = VOICE_BY_LANGUAGE[language];

      await TtsCache.create({
        _id: cacheId,
        textHash,
        language,
        voice,
        audioBase64,
      }).catch(() => undefined); // caching failure must not fail the response

      return { audioBase64, text, fallback: false };
    },
    env.AZURE_TTS_TIMEOUT_MS,
    () => ({ text, fallback: true })
  );
}

function synthesizeWithAzure(text: string, language: Language): Promise<string> {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(env.AZURE_SPEECH_KEY!, env.AZURE_SPEECH_REGION);
    speechConfig.speechSynthesisLanguage = LOCALE_BY_LANGUAGE[language];
    speechConfig.speechSynthesisVoiceName = VOICE_BY_LANGUAGE[language];

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData).toString("base64"));
        } else {
          reject(new Error(`tts_synthesis_failed:${result.reason}`));
        }
      },
      (error: unknown) => {
        synthesizer.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
