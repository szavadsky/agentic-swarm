#!/usr/bin/env bun
import { dispatch } from "../src/cli/dispatch.js";

const exitCode = await dispatch(process.argv.slice(2));
process.exit(exitCode);
