// ICE candidate-ek ellenőrzése a szignálozásban (a szerver a másik kliens adatát továbbítja).
import { isRecord, isString } from './guards';

const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean => value === undefined || value === null || check(value);

/** A candidate as RTCIceCandidate.toJSON() sends it; the object is kept as is. */
export const isIceCandidateInit = (value: unknown): value is RTCIceCandidateInit =>
  isRecord(value)
  && isString(value.candidate)
  && isOptional(value.sdpMid, isString)
  && isOptional(value.sdpMLineIndex, (v) => typeof v === 'number')
  && isOptional(value.usernameFragment, isString);
