export class OmpRpcExit extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly signal: string | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "OmpRpcExit";
  }
}

export class OmpRpcTimeout extends Error {
  constructor(readonly label: string) {
    super(`omp RPC timeout waiting for ${label}`);
    this.name = "OmpRpcTimeout";
  }
}
