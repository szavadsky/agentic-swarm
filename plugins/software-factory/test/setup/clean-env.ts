// The factory runs gates with its own FACTORY_RUN_CONFIG (real harness
// aliases) in the environment. config.ts reads it for every launch, so an
// inherited value made fake-harness launches stop as infra. Tests carry their
// own run.yaml or pass --run-config.
delete process.env.FACTORY_RUN_CONFIG;
