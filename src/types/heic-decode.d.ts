declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  function decode(input: { buffer: Buffer | Uint8Array }): Promise<Decoded>;
  export default decode;
}
