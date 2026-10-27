// Minimal types for the methods we use from the keyless Google Plus Codes library.
declare module "open-location-code" {
  export interface CodeArea {
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  }
  export class OpenLocationCode {
    isValid(code: string): boolean;
    isShort(code: string): boolean;
    isFull(code: string): boolean;
    decode(code: string): CodeArea;
    recoverNearest(
      shortCode: string,
      referenceLatitude: number,
      referenceLongitude: number,
    ): string;
  }
}
