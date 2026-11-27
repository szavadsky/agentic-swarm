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

/** An omp stdout line that is not an RPC frame: the protocol, not the model, failed. */
export class OmpRpcProtocol extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OmpRpcProtocol";
  }
}
